/**
 * GET  /api/mobile/marketing/campaigns         — list campaigns for the tenant
 * POST /api/mobile/marketing/campaigns         — create a draft campaign
 *   body: { name, template_id, scheduled_at? }
 *
 * Mobile-only mirror of the web endpoint. Auth is the shared
 * `resolveCurrentRestaurantForAdmin` so both owners and admin-role staff
 * can use it, per the product decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { data, error } = await adminSupabaseClient
    .from("marketing_campaigns")
    .select(
      "id, name, template_id, status, scheduled_at, total_recipients, sent_count, delivered_count, read_count, failed_count, created_at, sending_started_at, sending_completed_at, marketing_templates(id, name, category, language, approval_status)"
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

interface CreateBody {
  name?: string;
  template_id?: string;
  scheduled_at?: string | null;
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  const templateId = body.template_id?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!templateId) {
    return NextResponse.json({ error: "template_id required" }, { status: 400 });
  }

  // Template must belong to the tenant and be approved by WhatsApp.
  const { data: template, error: tplErr } = await adminSupabaseClient
    .from("marketing_templates")
    .select("id, approval_status")
    .eq("id", templateId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (tplErr) {
    return NextResponse.json({ error: tplErr.message }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  if (template.approval_status !== "approved") {
    return NextResponse.json(
      { error: "Template must be approved before creating a campaign" },
      { status: 400 }
    );
  }

  const status = body.scheduled_at ? "scheduled" : "draft";
  const now = new Date().toISOString();

  const { data, error } = await adminSupabaseClient
    .from("marketing_campaigns")
    .insert({
      restaurant_id: restaurantId,
      template_id: templateId,
      name,
      scheduled_at: body.scheduled_at || null,
      status,
      total_recipients: 0,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      failed_count: 0,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
