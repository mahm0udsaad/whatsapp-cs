import { NextRequest, NextResponse } from "next/server";
import { processPendingAIReplyJobs } from "@/lib/ai-reply-jobs";

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.replace(/^Bearer\s+/i, "");

  // Accept Vercel's auto-injected CRON_SECRET (used by vercel.json cron jobs)
  if (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) {
    return true;
  }

  // Also accept a manually configured worker secret for external callers
  if (process.env.AI_REPLY_WORKER_SECRET && bearer === process.env.AI_REPLY_WORKER_SECRET) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processPendingAIReplyJobs(10);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
