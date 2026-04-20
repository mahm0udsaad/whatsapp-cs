/**
 * GET /api/mobile/marketing/templates
 *
 * Approved templates for the caller's tenant. Mobile campaign creation only
 * lets the user pick from approved ones — unapproved rows are filtered so
 * the mobile UI never shows a template that can't legally be sent.
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { data, error } = await adminSupabaseClient
    .from("marketing_templates")
    .select(
      "id, name, category, language, body_template, header_type, header_text, header_image_url, footer_text, approval_status, created_at"
    )
    .eq("restaurant_id", restaurantId)
    .eq("approval_status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
