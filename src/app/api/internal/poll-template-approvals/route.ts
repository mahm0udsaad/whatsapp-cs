import { NextRequest, NextResponse } from "next/server";
import { processPendingTemplateApprovalPolls } from "@/lib/template-approval-poller";

const workerSecret = process.env.AI_REPLY_WORKER_SECRET;

function isAuthorized(request: NextRequest) {
  if (!workerSecret) {
    console.error("AI_REPLY_WORKER_SECRET not configured — denying access");
    return false;
  }

  const authorization = request.headers.get("authorization") || "";
  const cronSecret = request.headers.get("x-cron-secret") || "";
  return (
    authorization === `Bearer ${workerSecret}` || cronSecret === workerSecret
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processPendingTemplateApprovalPolls();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
