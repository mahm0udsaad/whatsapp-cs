/**
 * POST /api/dashboard/conversations/find-or-create
 * Body: { phone_number: string }
 *
 * Returns an existing conversation row for the tenant + phone pair, or
 * creates a fresh one. Used by the "send message" action on the customers
 * list so the dashboard can jump straight to /dashboard/inbox/{id}.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { findOrCreateConversationForPhone } from "@/lib/conversations";

const E164 = /^\+[1-9]\d{1,14}$/;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant)
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as
    | { phone_number?: string }
    | null;
  const phone = body?.phone_number?.trim();
  if (!phone || !E164.test(phone)) {
    return NextResponse.json(
      { error: "phone_number must be E.164" },
      { status: 400 }
    );
  }

  try {
    const conv = await findOrCreateConversationForPhone(restaurant.id, phone);
    return NextResponse.json(conv);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
