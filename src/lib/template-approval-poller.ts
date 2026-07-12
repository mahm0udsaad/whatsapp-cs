import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getApprovalStatus } from "@/lib/twilio-content";
import { notifyManagersOfTemplateDecision } from "@/lib/template-notifications";

const TERMINAL_STATUSES = ["approved", "rejected", "paused", "disabled"];

// Poll rows younger than this can be revived after abandonment. Meta reviews
// occasionally take days; anything older needs a manual re-submit anyway.
const REVIVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface PollRunResult {
  processed: number;
  approved: number;
  rejected: number;
  pending: number;
  abandoned: number;
  revived: number;
}

function getNextPollAt(pollCount: number): string | null {
  let delayMs: number;

  if (pollCount < 10) {
    // First ~5 minutes: every 30 seconds
    delayMs = 30 * 1000;
  } else if (pollCount < 30) {
    // Next ~1.5 hours: every 5 minutes
    delayMs = 5 * 60 * 1000;
  } else if (pollCount < 100) {
    // Next ~35 hours: every 30 minutes
    delayMs = 30 * 60 * 1000;
  } else {
    // ~48h total: abandon (revivable below while inside REVIVE_WINDOW_MS)
    return null;
  }

  return new Date(Date.now() + delayMs).toISOString();
}

/**
 * Revive recently-abandoned polls whose template never reached a terminal
 * status. This heals rows stranded by past poller outages (e.g. the Twilio
 * response-shape bug that made every poll error until abandonment).
 */
async function reviveAbandonedPolls(): Promise<number> {
  const cutoff = new Date(Date.now() - REVIVE_WINDOW_MS).toISOString();

  const { data: abandoned } = await adminSupabaseClient
    .from("template_approval_polls")
    .select("id, template_id, created_at")
    .eq("status", "abandoned")
    .gte("created_at", cutoff)
    .limit(50);

  if (!abandoned?.length) return 0;

  const templateIds = abandoned.map((p) => p.template_id);
  const { data: templates } = await adminSupabaseClient
    .from("marketing_templates")
    .select("id, approval_status")
    .in("id", templateIds);

  const nonTerminal = new Set(
    (templates || [])
      .filter((t) => !TERMINAL_STATUSES.includes(t.approval_status))
      .map((t) => t.id)
  );

  const toRevive = abandoned.filter((p) => nonTerminal.has(p.template_id));
  if (!toRevive.length) return 0;

  // Resume at the slow cadence (30-minute polls) instead of restarting fast.
  const { error } = await adminSupabaseClient
    .from("template_approval_polls")
    .update({
      status: "polling",
      poll_count: 30,
      next_poll_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in(
      "id",
      toRevive.map((p) => p.id)
    );

  return error ? 0 : toRevive.length;
}

export async function processPendingTemplateApprovalPolls(
  limit = 50
): Promise<PollRunResult> {
  const result: PollRunResult = {
    processed: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
    abandoned: 0,
    revived: 0,
  };

  try {
    result.revived = await reviveAbandonedPolls();
  } catch (err) {
    console.error("[template-poller] revive step failed:", err);
  }

  const now = new Date().toISOString();

  const { data: polls, error } = await adminSupabaseClient
    .from("template_approval_polls")
    .select("*")
    .eq("status", "polling")
    .lte("next_poll_at", now)
    .limit(limit);

  if (error) {
    console.error("[template-poller] failed to fetch due polls:", error);
    return result;
  }
  if (!polls?.length) return result;

  result.processed = polls.length;

  for (const poll of polls) {
    try {
      const { status, rejectionReason } = await getApprovalStatus(poll.twilio_content_sid);
      const normalizedStatus = status.toLowerCase();

      if (TERMINAL_STATUSES.includes(normalizedStatus)) {
        const templateUpdate: Record<string, unknown> = {
          approval_status: normalizedStatus,
          updated_at: new Date().toISOString(),
        };
        if (normalizedStatus === "rejected" && rejectionReason) {
          templateUpdate.rejection_reason = rejectionReason;
        }

        const { data: updatedTemplate } = await adminSupabaseClient
          .from("marketing_templates")
          .update(templateUpdate)
          .eq("id", poll.template_id)
          .select("id, name, restaurant_id")
          .single();

        await adminSupabaseClient
          .from("template_approval_polls")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", poll.id);

        if (normalizedStatus === "approved") result.approved++;
        else result.rejected++;

        if (updatedTemplate) {
          // Fire-and-forget — notification failures must not block polling.
          notifyManagersOfTemplateDecision({
            restaurantId: updatedTemplate.restaurant_id,
            templateId: updatedTemplate.id,
            templateName: updatedTemplate.name,
            status: normalizedStatus as
              | "approved"
              | "rejected"
              | "paused"
              | "disabled",
            rejectionReason:
              normalizedStatus === "rejected" ? rejectionReason : null,
          }).catch((e) =>
            console.error("[template-poller] notify failed:", e)
          );
        }
      } else {
        const newPollCount = (poll.poll_count || 0) + 1;
        const nextPollAt = getNextPollAt(newPollCount);

        await adminSupabaseClient
          .from("template_approval_polls")
          .update({
            status: nextPollAt ? "polling" : "abandoned",
            poll_count: newPollCount,
            ...(nextPollAt ? { next_poll_at: nextPollAt } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", poll.id);

        if (nextPollAt) result.pending++;
        else result.abandoned++;
      }
    } catch (err) {
      console.error(`[template-poller] Error polling template ${poll.template_id}:`, err);
      const newPollCount = (poll.poll_count || 0) + 1;
      const nextPollAt = getNextPollAt(newPollCount);
      await adminSupabaseClient
        .from("template_approval_polls")
        .update({
          status: nextPollAt ? "polling" : "abandoned",
          poll_count: newPollCount,
          ...(nextPollAt ? { next_poll_at: nextPollAt } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", poll.id);

      if (nextPollAt) result.pending++;
      else result.abandoned++;
    }
  }

  return result;
}
