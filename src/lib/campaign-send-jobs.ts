/**
 * Queue + worker primitives for outbound campaign sends.
 *
 * Why a queue instead of inline batch sending?
 *  - Vercel serverless requests have ~60s wall-time. A 5k-recipient campaign
 *    with the previous 50/sec inline loop blows that budget instantly.
 *  - We want per-recipient retry on Twilio 429/5xx without taking down the
 *    whole batch (and without the user's HTTP request blocking on it).
 *  - Per-send opt-out re-check closes the race where a customer opts out
 *    after audience selection but before the message is actually dispatched.
 *
 * Mechanism:
 *  - `enqueueCampaign` writes one `campaign_send_jobs` row per
 *    `campaign_recipients` row that is still pending. `customers.opted_out`
 *    and `opt_outs` are filtered at enqueue time AND at send time.
 *  - `processCampaignSendJobs` is invoked by the
 *    /api/internal/campaign-worker endpoint (driven by pg_cron once per
 *    minute). It claims a small batch with `for update skip locked`,
 *    dispatches each via `sendTemplateMessage`, and either marks each row
 *    `sent`, retries with exponential backoff (`failed_retryable`), or
 *    moves to a terminal state (`failed_terminal`).
 */

import { adminSupabaseClient } from "@/lib/supabase/admin";
import { sendTemplateMessage } from "@/lib/twilio-content";

const BACKOFF_SECONDS = [1, 4, 16, 64, 256];
const MAX_ATTEMPTS = BACKOFF_SECONDS.length;

export interface EnqueueResult {
  campaign_id: string;
  enqueued: number;
  opted_out_skipped: number;
}

export async function enqueueCampaign(
  campaignId: string,
  scheduledAt: string | null
): Promise<EnqueueResult> {
  // Pull pending recipients in chunks to avoid large in-memory arrays for
  // huge campaigns. Supabase JS doesn't support cursors so we page manually.
  const PAGE = 1000;
  let from = 0;
  let enqueued = 0;
  let optedOutSkipped = 0;

  // Build a phone → opted_out map ONCE for this enqueue cycle. Using two
  // sources of truth (customers.opted_out + opt_outs row) so an opt-out
  // recorded by either path is honored.
  const { data: optOutRows } = await adminSupabaseClient
    .from("opt_outs")
    .select("phone_number")
    .eq(
      "restaurant_id",
      (
        await adminSupabaseClient
          .from("marketing_campaigns")
          .select("restaurant_id")
          .eq("id", campaignId)
          .single()
      ).data?.restaurant_id ?? ""
    );
  const optedOutSet = new Set<string>(
    (optOutRows ?? []).map((r) => r.phone_number as string)
  );

  // Loop pages of recipients.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: recipients, error } = await adminSupabaseClient
      .from("campaign_recipients")
      .select("id, phone_number, status")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!recipients || recipients.length === 0) break;

    const toEnqueue: Array<{
      campaign_id: string;
      recipient_id: string;
      next_run_at: string;
      attempt: number;
      status: string;
    }> = [];

    for (const r of recipients) {
      if (optedOutSet.has(r.phone_number as string)) {
        optedOutSkipped++;
        // Mark the recipient terminal so the campaign reflects the skip.
        await adminSupabaseClient
          .from("campaign_recipients")
          .update({
            status: "failed",
            error_message: "opted_out",
          })
          .eq("id", r.id as string);
        continue;
      }
      toEnqueue.push({
        campaign_id: campaignId,
        recipient_id: r.id as string,
        next_run_at: scheduledAt ?? new Date().toISOString(),
        attempt: 0,
        status: "pending",
      });
    }

    if (toEnqueue.length > 0) {
      const { error: insErr } = await adminSupabaseClient
        .from("campaign_send_jobs")
        .upsert(toEnqueue, { onConflict: "recipient_id" });
      if (insErr) throw new Error(insErr.message);
      enqueued += toEnqueue.length;
    }

    if (recipients.length < PAGE) break;
    from += PAGE;
  }

  return { campaign_id: campaignId, enqueued, opted_out_skipped: optedOutSkipped };
}

interface JobRow {
  id: string;
  campaign_id: string;
  recipient_id: string;
  attempt: number;
}

interface CampaignContext {
  template_content_sid: string;
  from_phone: string;
  status_callback: string;
}

/** Twilio surfaces HTTP-style status codes on the err.status field. */
function classifyTwilioError(err: unknown): "retryable" | "terminal" {
  const e = err as { status?: number; code?: number; message?: string };
  if (e?.status === 429) return "retryable";
  if (typeof e?.status === "number" && e.status >= 500 && e.status < 600)
    return "retryable";
  // Network/timeout-ish — assume transient.
  if (
    typeof e?.message === "string" &&
    /(ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|network)/i.test(e.message)
  )
    return "retryable";
  return "terminal";
}

export async function processCampaignSendJobs(maxJobs: number): Promise<{
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  campaigns_touched: number;
}> {
  // Atomically claim a batch of jobs whose `next_run_at <= now()`. The
  // `select … for update skip locked` semantics are what make the worker
  // safe to run concurrently. Postgres function makes this a single round.
  const { data: claimed, error: claimError } = await adminSupabaseClient.rpc(
    "claim_campaign_send_jobs",
    { p_limit: maxJobs }
  );

  if (claimError) {
    // RPC not present (first run before migration applied) — fall back to a
    // best-effort claim. This still races, but only matters in dev.
    return await fallbackClaimAndProcess(maxJobs);
  }

  const jobs = (claimed as JobRow[]) ?? [];
  if (jobs.length === 0) {
    return { claimed: 0, sent: 0, retried: 0, failed: 0, campaigns_touched: 0 };
  }

  return await dispatchClaimedJobs(jobs);
}

async function fallbackClaimAndProcess(maxJobs: number) {
  const { data: rows } = await adminSupabaseClient
    .from("campaign_send_jobs")
    .select("id, campaign_id, recipient_id, attempt")
    .in("status", ["pending", "failed_retryable"])
    .lte("next_run_at", new Date().toISOString())
    .limit(maxJobs);

  if (!rows || rows.length === 0)
    return { claimed: 0, sent: 0, retried: 0, failed: 0, campaigns_touched: 0 };

  const ids = rows.map((r) => r.id as string);
  await adminSupabaseClient
    .from("campaign_send_jobs")
    .update({
      status: "sending",
      locked_at: new Date().toISOString(),
      locked_by: "fallback",
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  return await dispatchClaimedJobs(rows as JobRow[]);
}

async function dispatchClaimedJobs(jobs: JobRow[]) {
  const campaignIds = Array.from(new Set(jobs.map((j) => j.campaign_id)));
  const ctxByCampaign = new Map<string, CampaignContext | "missing">();

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
  const statusCallback = `${appUrl}/api/webhooks/twilio/status`;

  // Pre-load campaign + template + restaurant phone info (one query per cid).
  for (const cid of campaignIds) {
    const { data: campaign } = await adminSupabaseClient
      .from("marketing_campaigns")
      .select("id, restaurant_id, template_id, status")
      .eq("id", cid)
      .single();
    if (!campaign?.template_id) {
      ctxByCampaign.set(cid, "missing");
      continue;
    }
    const [{ data: template }, { data: restaurant }] = await Promise.all([
      adminSupabaseClient
        .from("marketing_templates")
        .select("twilio_content_sid, approval_status")
        .eq("id", campaign.template_id)
        .single(),
      adminSupabaseClient
        .from("restaurants")
        .select("twilio_phone_number")
        .eq("id", campaign.restaurant_id)
        .single(),
    ]);
    if (
      !template?.twilio_content_sid ||
      template.approval_status !== "approved"
    ) {
      ctxByCampaign.set(cid, "missing");
      continue;
    }
    const fromNumber =
      (restaurant?.twilio_phone_number as string | null) ||
      process.env.TWILIO_PHONE_NUMBER ||
      "";
    if (!fromNumber) {
      ctxByCampaign.set(cid, "missing");
      continue;
    }
    ctxByCampaign.set(cid, {
      template_content_sid: template.twilio_content_sid as string,
      from_phone: fromNumber,
      status_callback: statusCallback,
    });
    // Make sure the campaign reflects sending state on first dispatch.
    await adminSupabaseClient
      .from("marketing_campaigns")
      .update({
        status: "sending",
        sending_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", cid)
      .in("status", ["queued", "scheduled", "draft"]);
  }

  let sent = 0;
  let retried = 0;
  let failed = 0;

  for (const job of jobs) {
    const ctx = ctxByCampaign.get(job.campaign_id);
    if (!ctx || ctx === "missing") {
      await adminSupabaseClient
        .from("campaign_send_jobs")
        .update({
          status: "failed_terminal",
          last_error: "campaign or template missing/unapproved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      failed++;
      continue;
    }

    // Re-check opt-out at send time.
    const { data: recipient } = await adminSupabaseClient
      .from("campaign_recipients")
      .select("phone_number, name, metadata, status")
      .eq("id", job.recipient_id)
      .single();
    if (!recipient) {
      await adminSupabaseClient
        .from("campaign_send_jobs")
        .update({
          status: "failed_terminal",
          last_error: "recipient row missing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      failed++;
      continue;
    }

    const { data: cust } = await adminSupabaseClient
      .from("customers")
      .select("opted_out")
      .eq(
        "restaurant_id",
        (
          await adminSupabaseClient
            .from("marketing_campaigns")
            .select("restaurant_id")
            .eq("id", job.campaign_id)
            .single()
        ).data?.restaurant_id ?? ""
      )
      .eq("phone_number", recipient.phone_number as string)
      .maybeSingle();
    if (cust?.opted_out) {
      await Promise.all([
        adminSupabaseClient
          .from("campaign_send_jobs")
          .update({
            status: "failed_terminal",
            last_error: "opted_out_at_send_time",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id),
        adminSupabaseClient
          .from("campaign_recipients")
          .update({
            status: "failed",
            error_message: "opted_out_at_send_time",
          })
          .eq("id", job.recipient_id),
      ]);
      failed++;
      continue;
    }

    // Build content variables. Recipient.name → {{1}}; metadata keys override.
    const vars: Record<string, string> = {};
    if (recipient.name) vars["1"] = recipient.name as string;
    if (recipient.metadata && typeof recipient.metadata === "object") {
      for (const [k, v] of Object.entries(
        recipient.metadata as Record<string, unknown>
      )) {
        if (vars[k] === undefined) vars[k] = String(v);
      }
    }

    try {
      const { messageSid } = await sendTemplateMessage({
        contentSid: ctx.template_content_sid,
        contentVariables: vars,
        from: ctx.from_phone,
        to: recipient.phone_number as string,
        statusCallback: ctx.status_callback,
      });

      await Promise.all([
        adminSupabaseClient
          .from("campaign_send_jobs")
          .update({
            status: "sent",
            twilio_message_sid: messageSid,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id),
        adminSupabaseClient
          .from("campaign_recipients")
          .update({
            status: "sent",
            twilio_message_sid: messageSid,
            sent_at: new Date().toISOString(),
          })
          .eq("id", job.recipient_id),
      ]);
      sent++;
    } catch (err) {
      const cls = classifyTwilioError(err);
      const message =
        err instanceof Error ? err.message : "Unknown send error";
      const code = (err as { status?: number }).status?.toString() ?? null;

      if (cls === "retryable" && job.attempt + 1 < MAX_ATTEMPTS) {
        const delay = BACKOFF_SECONDS[job.attempt] * 1000;
        const nextRunAt = new Date(Date.now() + delay).toISOString();
        await adminSupabaseClient
          .from("campaign_send_jobs")
          .update({
            status: "failed_retryable",
            attempt: job.attempt + 1,
            next_run_at: nextRunAt,
            last_error: message,
            error_code: code,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        retried++;
      } else {
        await Promise.all([
          adminSupabaseClient
            .from("campaign_send_jobs")
            .update({
              status: "failed_terminal",
              attempt: job.attempt + 1,
              last_error: message,
              error_code: code,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id),
          adminSupabaseClient
            .from("campaign_recipients")
            .update({
              status: "failed",
              error_message: message.slice(0, 500),
            })
            .eq("id", job.recipient_id),
        ]);
        failed++;
      }
    }
  }

  // Recompute aggregates per touched campaign so the dashboard reflects
  // progress without waiting for the next status callback.
  for (const cid of campaignIds) {
    await adminSupabaseClient.rpc("recompute_campaign_counts", {
      p_campaign_id: cid,
    });
  }

  return {
    claimed: jobs.length,
    sent,
    retried,
    failed,
    campaigns_touched: campaignIds.length,
  };
}
