/**
 * POST /api/mobile/inbox/conversations/:id/archive
 *
 * Toggle a conversation's archived state. Body: { archived: boolean }.
 * `archived: true` sets archived_at = now(); `false` clears it.
 *
 * RLS on conversations already gates writes to members of the tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface Body {
  archived?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await params;
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversation id required" },
      { status: 400 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const archived = body.archived === true;
  const archivedAt = archived ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("conversations")
    .update({ archived_at: archivedAt })
    .eq("id", conversationId)
    .select("id, archived_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
