/**
 * PATCH  /api/dashboard/customers/:id — edit name / metadata / opted_out
 * DELETE /api/dashboard/customers/:id — hard delete
 *
 * When `opted_out` is toggled, `opt_outs` is updated in lockstep so the
 * downstream campaign worker + webhook skip-at-send-time logic respects it.
 * The existing `opt_outs_sync_customers` trigger handles the reverse path
 * (opt_outs row inserted/deleted → customers.opted_out flipped).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";

async function loadCustomer(id: string, restaurantId: string) {
  const { data } = await adminSupabaseClient
    .from("customers")
    .select("id, phone_number, restaurant_id")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return data as { id: string; phone_number: string; restaurant_id: string } | null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant)
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const { id } = await params;
  const existing = await loadCustomer(id, restaurant.id);
  if (!existing)
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as
    | {
        full_name?: string | null;
        metadata?: Record<string, unknown> | null;
        opted_out?: boolean;
      }
    | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.full_name !== undefined)
    updates.full_name = body.full_name?.toString().trim() || null;
  if (body.metadata !== undefined) updates.metadata = body.metadata ?? {};
  if (body.opted_out !== undefined) updates.opted_out = !!body.opted_out;

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Sync opt_outs when toggled. Trigger `opt_outs_sync_customers` mirrors
  // back into customers.opted_out so both directions converge.
  if (body.opted_out === true) {
    await adminSupabaseClient.from("opt_outs").upsert(
      {
        restaurant_id: restaurant.id,
        phone_number: existing.phone_number,
        reason: "manual_admin",
      },
      { onConflict: "restaurant_id,phone_number" }
    );
  } else if (body.opted_out === false) {
    await adminSupabaseClient
      .from("opt_outs")
      .delete()
      .eq("restaurant_id", restaurant.id)
      .eq("phone_number", existing.phone_number);
  }

  const { data, error } = await adminSupabaseClient
    .from("customers")
    .update(updates)
    .eq("id", id)
    .eq("restaurant_id", restaurant.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customer: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant)
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const { id } = await params;
  const { error } = await adminSupabaseClient
    .from("customers")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", restaurant.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
