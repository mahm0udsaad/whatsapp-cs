/**
 * POST /api/internal/campaign-worker
 *
 * Internal worker endpoint that drains the `campaign_send_jobs` queue.
 * Invoked by Supabase pg_cron every minute (see
 * `supabase/migrations/20260425010000_campaign_worker_cron.sql`). Authed
 * with the same `CRON_SECRET` Bearer / `x-cron-secret` header as the other
 * internal endpoints under `/api/internal/*`.
 *
 * Each call processes up to BATCH jobs. The pg_cron schedule plus the small
 * batch acts as a soft rate-limit that keeps Twilio sends well under any
 * sender's MPS cap; the BACKOFF tier inside `processCampaignSendJobs`
 * handles 429s by re-scheduling rather than spinning the worker.
 */

import { NextRequest, NextResponse } from "next/server";
import { processCampaignSendJobs } from "@/lib/campaign-send-jobs";

const BATCH = 100;

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  const headerSecret = request.headers.get("x-cron-secret") || "";

  if (process.env.CRON_SECRET) {
    if (bearer === process.env.CRON_SECRET) return true;
    if (headerSecret === process.env.CRON_SECRET) return true;
  }
  if (
    process.env.AI_REPLY_WORKER_SECRET &&
    bearer === process.env.AI_REPLY_WORKER_SECRET
  )
    return true;

  return false;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processCampaignSendJobs(BATCH);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
