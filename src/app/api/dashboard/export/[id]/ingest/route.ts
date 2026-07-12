/**
 * POST /api/dashboard/export/:id/ingest
 * Downloads the ready export archive and persists its 1:1 chat history into our
 * live tables (customers + conversations + messages + whatsapp-media). Safe to
 * call more than once — messages de-dupe on the WhatsApp message id. Call this
 * BEFORE disconnect, since disconnect purges the archive on the VPS.
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { requireOwnedExport } from "@/lib/wa-export-owner";
import { downloadExportZip } from "@/lib/wa-export";
import { ingestExportZip } from "@/lib/export-ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireOwnedExport(id);
  if ("error" in guard) return guard.error;

  let zip: Buffer;
  try {
    zip = await downloadExportZip(id);
  } catch {
    return NextResponse.json(
      { error: "Archive not ready — wait for the sync to finish, then approve." },
      { status: 409 }
    );
  }

  try {
    const result = await ingestExportZip({
      restaurantId: guard.restaurantId,
      exportId: id,
      zip,
    });

    const now = new Date().toISOString();
    await adminSupabaseClient
      .from("client_exports")
      .update({
        status: "ingested",
        ingest_result: result,
        ingested_at: now,
        approved_at: now,
        updated_at: now,
      })
      .eq("id", id);

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to save chats: ${message}` },
      { status: 500 }
    );
  }
}
