import { NextRequest, NextResponse } from "next/server";
import { processPendingTemplateApprovalPolls } from "@/lib/template-approval-poller";

// pg_cron (internal_cron.call_endpoint) sends the vault `cron_secret`, which
// is CRON_SECRET — accept it like the other internal endpoints, plus the
// legacy worker secret.
function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const headerSecret = request.headers.get("x-cron-secret") || "";

  for (const secret of [
    process.env.CRON_SECRET,
    process.env.AI_REPLY_WORKER_SECRET,
  ]) {
    if (secret && (bearer === secret || headerSecret === secret)) return true;
  }
  return false;
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
