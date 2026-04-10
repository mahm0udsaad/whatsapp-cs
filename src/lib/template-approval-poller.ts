import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getApprovalStatus } from "@/lib/twilio-content";

const TERMINAL_STATUSES = ["approved", "rejected", "paused", "disabled"];

function getNextPollAt(pollCount: number): string | null {
  let delayMs: number;

  if (pollCount < 10) {
    delayMs = 30 * 1000;
  } else if (pollCount < 30) {
    delayMs = 5 * 60 * 1000;
  } else if (pollCount < 100) {
    delayMs = 30 * 60 * 1000;
  } else {
    return null;
  }

  return new Date(Date.now() + delayMs).toISOString();
}

export async function processPendingTemplateApprovalPolls(limit = 50) {
  const now = new Date().toISOString();

  const { data: polls, error } = await adminSupabaseClient
    .from("template_approval_polls")
    .select("*")
    .eq("status", "polling")
    .lte("next_poll_at", now)
    .limit(limit);

  if (error || !polls?.length) return;

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

        await adminSupabaseClient
          .from("marketing_templates")
          .update(templateUpdate)
          .eq("id", poll.template_id);

        await adminSupabaseClient
          .from("template_approval_polls")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", poll.id);
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
    }
  }
}
