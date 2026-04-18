import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getOwnerContext } from "@/lib/ai-manager-auth";

export async function GET() {
  const owner = await getOwnerContext();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await adminSupabaseClient
    .from("owner_ai_manager_threads")
    .select(
      "id, title, status, last_message_at, created_at, updated_at, owner_user_id"
    )
    .eq("restaurant_id", owner.restaurantId)
    .order("status", { ascending: true }) // 'archived' > 'open' alphabetically, but 'open' < 'archived' so open comes first
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter: only show this owner's threads unless super-admin.
  const rows = (data ?? []).filter((r) => {
    const row = r as { owner_user_id: string };
    return owner.isSuperAdmin || row.owner_user_id === owner.userId;
  });

  return NextResponse.json({ threads: rows });
}

export async function POST() {
  const owner = await getOwnerContext();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await adminSupabaseClient
    .from("owner_ai_manager_threads")
    .insert({
      restaurant_id: owner.restaurantId,
      owner_user_id: owner.userId,
      status: "open",
    })
    .select("id, title, status, last_message_at, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ thread: data }, { status: 201 });
}
