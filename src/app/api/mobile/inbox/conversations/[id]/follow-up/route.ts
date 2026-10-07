/**
 * POST /api/mobile/inbox/conversations/:id/follow-up
 *
 * Flag / unflag a conversation for follow-up.
 * Body: { follow_up: boolean, note?: string }.
 * `follow_up: true` sets follow_up_at = now(), follow_up_by = caller's team
 * member row, follow_up_note = note; `false` clears all three.
 *
 * RLS on conversations already gates writes to members of the tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface Body {
  follow_up?: boolean;
  note?: string | null;
}

const MAX_NOTE_LENGTH = 500;

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

  const followUp = body.follow_up === true;

  let update: {
    follow_up_at: string | null;
    follow_up_by: string | null;
    follow_up_note: string | null;
  } = { follow_up_at: null, follow_up_by: null, follow_up_note: null };

  if (followUp) {
    // Scope the member lookup to the conversation's tenant. The conversation
    // read goes through RLS, so a foreign conversation id resolves to nothing.
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("restaurant_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (convErr) {
      return NextResponse.json({ error: convErr.message }, { status: 500 });
    }
    if (!conv) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: member } = await supabase
      .from("team_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", conv.restaurant_id)
      .maybeSingle();

    const note = body.note?.trim().slice(0, MAX_NOTE_LENGTH) || null;
    update = {
      follow_up_at: new Date().toISOString(),
      follow_up_by: member?.id ?? null,
      follow_up_note: note,
    };
  }

  const { data, error } = await supabase
    .from("conversations")
    .update(update)
    .eq("id", conversationId)
    .select("id, follow_up_at, follow_up_by, follow_up_note")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
