import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getOwnerContext } from "@/lib/ai-manager-auth";

const ALLOWED_STATUSES = new Set(["active", "archived", "draft"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const owner = await getOwnerContext();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the instruction belongs to this tenant.
  const { data: existing } = await adminSupabaseClient
    .from("agent_instructions")
    .select("id, restaurant_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = existing as { id: string; restaurant_id: string };
  if (!owner.isSuperAdmin && row.restaurant_id !== owner.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    title?: unknown;
    content_body?: unknown;
    tags?: unknown;
    status?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) {
      return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    }
    updates.title = t.slice(0, 160);
  }
  if (typeof body.content_body === "string") {
    const b = body.content_body.trim();
    if (!b) {
      return NextResponse.json(
        { error: "content_body cannot be empty" },
        { status: 400 }
      );
    }
    updates.body = b.slice(0, 4000);
  }
  if (Array.isArray(body.tags)) {
    updates.tags = body.tags
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter((t) => t.length > 0)
      .slice(0, 8);
  }
  if (typeof body.status === "string" && ALLOWED_STATUSES.has(body.status)) {
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await adminSupabaseClient
    .from("agent_instructions")
    .update(updates)
    .eq("id", id)
    .select("id, version, title, body, tags, status, authored_via, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ instruction: data });
}
