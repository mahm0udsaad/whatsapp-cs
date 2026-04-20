import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { id } = await params;
  const { data: existing } = await adminSupabaseClient
    .from("customers")
    .select("id, phone_number")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!existing)
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as
    | {
        full_name?: string | null;
        metadata?: Record<string, unknown> | null;
        opted_out?: boolean;
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.full_name !== undefined)
    updates.full_name = body.full_name?.toString().trim() || null;
  if (body.metadata !== undefined) updates.metadata = body.metadata ?? {};
  if (body.opted_out !== undefined) updates.opted_out = !!body.opted_out;

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (body.opted_out === true) {
    await adminSupabaseClient.from("opt_outs").upsert(
      {
        restaurant_id: restaurantId,
        phone_number: (existing as { phone_number: string }).phone_number,
        reason: "manual_admin",
      },
      { onConflict: "restaurant_id,phone_number" }
    );
  } else if (body.opted_out === false) {
    await adminSupabaseClient
      .from("opt_outs")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("phone_number", (existing as { phone_number: string }).phone_number);
  }

  const { data, error } = await adminSupabaseClient
    .from("customers")
    .update(updates)
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customer: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { id } = await params;
  const { error } = await adminSupabaseClient
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
