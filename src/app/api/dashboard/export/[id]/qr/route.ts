/**
 * GET /api/dashboard/export/:id/qr
 * Proxies the current QR + status for an owned export (poll while scanning).
 */

import { NextResponse } from "next/server";
import { requireOwnedExport } from "@/lib/wa-export-owner";
import { getExportQr } from "@/lib/wa-export";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireOwnedExport(id);
  if ("error" in guard) return guard.error;

  try {
    const qr = await getExportQr(id);
    return NextResponse.json(qr);
  } catch {
    return NextResponse.json({ error: "Failed to fetch QR" }, { status: 502 });
  }
}
