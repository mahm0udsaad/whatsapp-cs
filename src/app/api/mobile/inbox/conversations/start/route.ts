/**
 * POST /api/mobile/inbox/conversations/start
 *
 * "New chat" for any active team member: resolves (or creates) the tenant's
 * conversation with a phone number so the app can open the chat screen and
 * send an approved template from there.
 *
 * Body: { restaurantId, phone_number (E.164), customer_name? }
 * Reply: { id, is_new, in_24h_window }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { assertRestaurantMember } from "@/lib/mobile-auth";
import { findOrCreateConversationForPhone } from "@/lib/conversations";
import { E164, OPTED_OUT_ERROR, isPhoneOptedOut } from "@/lib/template-send";

interface Body {
  restaurantId?: string;
  phone_number?: string;
  customer_name?: string | null;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const ctx = await assertRestaurantMember(body?.restaurantId?.trim());
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const phone = body?.phone_number?.trim();
  const customerName = body?.customer_name?.trim().slice(0, 120) || null;
  if (!phone || !E164.test(phone)) {
    return NextResponse.json(
      { error: "رقم الهاتف يجب أن يكون بصيغة دولية مثل ‎+9665XXXXXXXX" },
      { status: 400 }
    );
  }

  try {
    if (await isPhoneOptedOut(restaurantId, phone)) {
      return NextResponse.json({ error: OPTED_OUT_ERROR }, { status: 409 });
    }

    // Keep the customer directory in sync: create the row, or fill a
    // missing name — never overwrite a stored one.
    const nowIso = new Date().toISOString();
    const { data: customer } = await adminSupabaseClient
      .from("customers")
      .select("id, full_name")
      .eq("restaurant_id", restaurantId)
      .eq("phone_number", phone)
      .maybeSingle();
    if (!customer) {
      await adminSupabaseClient.from("customers").upsert(
        {
          restaurant_id: restaurantId,
          phone_number: phone,
          full_name: customerName,
          source: "manual",
          updated_at: nowIso,
        },
        { onConflict: "restaurant_id,phone_number", ignoreDuplicates: true }
      );
    } else if (customerName && !customer.full_name) {
      await adminSupabaseClient
        .from("customers")
        .update({ full_name: customerName, updated_at: nowIso })
        .eq("id", customer.id as string);
    }

    const conv = await findOrCreateConversationForPhone(restaurantId, phone);

    if (customerName) {
      await adminSupabaseClient
        .from("conversations")
        .update({ customer_name: customerName })
        .eq("id", conv.id)
        .eq("restaurant_id", restaurantId)
        .is("customer_name", null);
    }

    return NextResponse.json({
      id: conv.id,
      is_new: conv.is_new,
      in_24h_window: conv.in_24h_window,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
