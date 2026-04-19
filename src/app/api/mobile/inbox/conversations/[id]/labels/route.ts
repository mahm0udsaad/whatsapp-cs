/**
 * PUT /api/mobile/inbox/conversations/:id/labels
 *
 * Replace the full set of labels on a conversation. Body: { labelIds: string[] }.
 * Empty array clears all labels. Members of the conversation's tenant only.
 *
 * Returns the new list so the client can reconcile cache without a refetch.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface PutBody {
  labelIds?: string[];
}

export async function PUT(
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

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawIds = Array.isArray(body.labelIds) ? body.labelIds : [];
  // Dedup + basic hygiene. DB enforces real UUIDs.
  const labelIds = Array.from(
    new Set(rawIds.filter((x): x is string => typeof x === "string" && !!x))
  );

  // Confirm the caller can see the conversation (RLS). If the row isn't
  // visible we bail early rather than partially mutating assignments.
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, restaurant_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }
  if (!conv) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  // Full replace: delete all existing rows then insert the new set. We do
  // this in two steps (no single-statement upsert replace) — each respects
  // RLS. For a small label cardinality per conversation this is fine.
  const { error: delErr } = await supabase
    .from("conversation_label_assignments")
    .delete()
    .eq("conversation_id", conversationId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (labelIds.length > 0) {
    const rows = labelIds.map((label_id) => ({
      conversation_id: conversationId,
      label_id,
      assigned_by: user.id,
    }));
    const { error: insErr } = await supabase
      .from("conversation_label_assignments")
      .insert(rows);
    if (insErr) {
      // FK violation (bad label id, or label belongs to another tenant)
      if (insErr.code === "23503") {
        return NextResponse.json(
          { error: "One or more labels are invalid" },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ labelIds });
}
