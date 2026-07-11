/**
 * GET /api/dashboard/export/:id/download
 * Streams the built ZIP archive for an owned export (call once status=ready).
 */

import { NextResponse } from "next/server";
import { requireOwnedExport } from "@/lib/wa-export-owner";
import { waExportFetch } from "@/lib/wa-export";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireOwnedExport(id);
  if ("error" in guard) return guard.error;

  const upstream = await waExportFetch(`/exports/${id}/download`);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Archive not ready" },
      { status: upstream.status === 409 ? 409 : 502 }
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="export-${id}.zip"`,
    },
  });
}
