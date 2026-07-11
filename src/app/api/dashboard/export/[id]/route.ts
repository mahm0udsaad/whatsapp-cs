/**
 * GET /api/dashboard/export/:id
 * Returns live status + pull progress for an owned export, and mirrors the
 * latest status/counts/number into `client_exports`.
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { requireOwnedExport } from "@/lib/wa-export-owner";
import { getExportStatus } from "@/lib/wa-export";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireOwnedExport(id);
  if ("error" in guard) return guard.error;

  try {
    const summary = await getExportStatus(id);

    await adminSupabaseClient
      .from("client_exports")
      .update({
        status: summary.status,
        client_number: summary.number,
        counts: summary.progress,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json(summary);
  } catch {
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 502 });
  }
}
