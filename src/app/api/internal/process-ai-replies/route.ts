import { NextRequest, NextResponse } from "next/server";
import { processPendingAIReplyJobs } from "@/lib/ai-reply-jobs";

const workerSecret = process.env.AI_REPLY_WORKER_SECRET;

function isAuthorized(request: NextRequest) {
  if (!workerSecret) {
    return true;
  }

  const authorization = request.headers.get("authorization") || "";
  return authorization === `Bearer ${workerSecret}`;
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
