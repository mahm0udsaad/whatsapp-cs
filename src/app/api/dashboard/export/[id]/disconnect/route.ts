/**
 * POST /api/dashboard/export/:id/disconnect
 * Unlinks the client's WhatsApp and purges all local data on the wa-export
 * service, then marks the export disconnected.
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { requireOwnedExport } from "@/lib/wa-export-owner";
import { disconnectExport } from "@/lib/wa-export";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireOwnedExport(id);
  if ("error" in guard) return guard.error;

  try {
    await disconnectExport(id);
  } catch {
    // Best-effort: still mark disconnected locally so the UI can move on.
  }

  await adminSupabaseClient
    .from("client_exports")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ status: "disconnected" });
}
