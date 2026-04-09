import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getApprovalStatus } from "@/lib/twilio-content";

const workerSecret = process.env.AI_REPLY_WORKER_SECRET;

function isAuthorized(request: NextRequest) {
  if (!workerSecret) {
    console.error("AI_REPLY_WORKER_SECRET not configured — denying access");
    return false;
  }

  const authorization = request.headers.get("authorization") || "";
  return authorization === `Bearer ${workerSecret}`;
}

const TERMINAL_STATUSES = ["approved", "rejected", "paused", "disabled"];

function getNextPollAt(pollCount: number): string | null {
  let delayMs: number;

  if (pollCount < 10) {
    // First 5 minutes: poll every 30 seconds
    delayMs = 30 * 1000;
  } else if (pollCount < 30) {
    // Next ~1.5 hours: poll every 5 minutes
    delayMs = 5 * 60 * 1000;
  } else if (pollCount < 100) {
    // Next ~35 hours: poll every 30 minutes
    delayMs = 30 * 60 * 1000;
  } else {
    // After ~48 hours total: abandon
    return null;
  }

  return new Date(Date.now() + delayMs).toISOString();
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date().toISOString();

    // Fetch polls that are due
    const { data: polls, error: pollError } = await adminSupabaseClient
      .from("template_approval_polls")
      .select("*")
      .eq("status", "polling")
      .lte("next_poll_at", now)
      .limit(50);

    if (pollError) {
      return NextResponse.json({ error: pollError.message }, { status: 500 });
    }

    if (!polls || polls.length === 0) {
      return NextResponse.json(
        { processed: 0, approved: 0, rejected: 0, pending: 0, abandoned: 0 },
        { status: 200 }
      );
    }

    let approved = 0;
    let rejected = 0;
    let pending = 0;
    let abandoned = 0;

    for (const poll of polls) {
      try {
        const { status, rejectionReason } = await getApprovalStatus(
          poll.twilio_content_sid
        );

        const normalizedStatus = status.toLowerCase();

        if (TERMINAL_STATUSES.includes(normalizedStatus)) {
          // Update template approval status
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

          // Mark poll as completed
          await adminSupabaseClient
            .from("template_approval_polls")
            .update({
              status: "completed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", poll.id);

          if (normalizedStatus === "approved") approved++;
          else rejected++; // rejected, paused, disabled all count as rejected
        } else {
          // Still pending/received - schedule next poll
          const newPollCount = (poll.poll_count || 0) + 1;
          const nextPollAt = getNextPollAt(newPollCount);

          if (nextPollAt === null) {
            // Abandon this poll
            await adminSupabaseClient
              .from("template_approval_polls")
              .update({
                status: "abandoned",
                poll_count: newPollCount,
                updated_at: new Date().toISOString(),
              })
              .eq("id", poll.id);

            abandoned++;
          } else {
            await adminSupabaseClient
              .from("template_approval_polls")
              .update({
                poll_count: newPollCount,
                next_poll_at: nextPollAt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", poll.id);

            pending++;
          }
        }
      } catch (err) {
        console.error(
          `Error polling approval for template ${poll.template_id}:`,
          err
        );
        // Increment poll count even on error to avoid infinite retries
        const newPollCount = (poll.poll_count || 0) + 1;
        const nextPollAt = getNextPollAt(newPollCount);

        if (nextPollAt === null) {
          await adminSupabaseClient
            .from("template_approval_polls")
            .update({
              status: "abandoned",
              poll_count: newPollCount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", poll.id);
          abandoned++;
        } else {
          await adminSupabaseClient
            .from("template_approval_polls")
            .update({
              poll_count: newPollCount,
              next_poll_at: nextPollAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", poll.id);
          pending++;
        }
      }
    }

    return NextResponse.json(
      {
        processed: polls.length,
        approved,
        rejected,
        pending,
        abandoned,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
