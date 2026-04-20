/**
 * POST /api/mobile/conversations/find-or-create
 * Body: { phone_number: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { findOrCreateConversationForPhone } from "@/lib/conversations";

const E164 = /^\+[1-9]\d{1,14}$/;

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

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
    const conv = await findOrCreateConversationForPhone(restaurantId, phone);
    return NextResponse.json(conv);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
