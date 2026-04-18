import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getOwnerContext } from "@/lib/ai-manager-auth";

export async function GET() {
  const owner = await getOwnerContext();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await adminSupabaseClient
    .from("agent_instructions")
    .select(
      "id, version, title, body, tags, status, authored_via, source_thread_id, created_at"
    )
    .eq("restaurant_id", owner.restaurantId)
    .order("version", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ instructions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const owner = await getOwnerContext();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: unknown; content_body?: unknown; tags?: unknown };
  try {
    body = (await request.json()) as {
      title?: unknown;
      content_body?: unknown;
      tags?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const contentBody =
    typeof body.content_body === "string" ? body.content_body.trim() : "";
  if (!title || !contentBody) {
    return NextResponse.json(
      { error: "title and content_body are required" },
      { status: 400 }
    );
  }

  const tags = Array.isArray(body.tags)
    ? body.tags
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => t.length > 0)
        .slice(0, 8)
    : [];

  const { data, error } = await adminSupabaseClient
    .from("agent_instructions")
    .insert({
      restaurant_id: owner.restaurantId,
      version: 0, // overwritten by the trigger
      title: title.slice(0, 160),
      body: contentBody.slice(0, 4000),
      tags,
      status: "active",
      author_user_id: owner.userId,
      authored_via: "manual",
    })
    .select("id, version, title, body, tags, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ instruction: data }, { status: 201 });
}
