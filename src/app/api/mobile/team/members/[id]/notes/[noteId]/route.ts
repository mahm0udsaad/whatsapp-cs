/**
 * DELETE /api/mobile/team/members/:id/notes/:noteId
 *
 * RLS lets the author of a note delete it, and the tenant owner delete any.
 * Managers who are not the author and not the owner get a silent 0-row
 * delete, which we translate into 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const { id: teamMemberId, noteId } = await params;
  if (!noteId) {
    return NextResponse.json({ error: "noteId required" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { error, count } = await supabase
    .from("team_member_notes")
    .delete({ count: "exact" })
    .eq("id", noteId)
    .eq("team_member_id", teamMemberId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json(
      { error: "Not found or not permitted" },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
