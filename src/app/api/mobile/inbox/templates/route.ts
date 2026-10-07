/**
 * GET /api/mobile/inbox/templates?restaurantId=
 *
 * Approved WhatsApp templates for the in-chat template picker. Open to every
 * active team member (agents included) — the manager-only library with all
 * statuses stays at /api/mobile/marketing/templates.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { assertRestaurantMember } from "@/lib/mobile-auth";

export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId")?.trim();
  const ctx = await assertRestaurantMember(restaurantId);
  if (ctx instanceof NextResponse) return ctx;

  const { data, error } = await adminSupabaseClient
    .from("marketing_templates")
    .select(
      "id, name, category, language, body_template, header_type, header_text, header_image_url, footer_text, buttons, variables"
    )
    .eq("restaurant_id", ctx.restaurantId)
    .eq("approval_status", "approved")
    .not("twilio_content_sid", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
