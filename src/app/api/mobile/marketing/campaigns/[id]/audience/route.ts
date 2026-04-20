/**
 * POST /api/mobile/marketing/campaigns/:id/audience
 *
 * Build the recipient list for a draft campaign. Three audience kinds:
 *   - { kind: 'all' }                         → every customer not opted out
 *   - { kind: 'since', since: ISO }           → customers with last_seen_at >= since
 *   - { kind: 'custom', phones: string[] }    → explicit list from the mobile UI
 *
 * Fully replaces the existing recipients on the campaign. Only works while
 * the campaign is in draft/scheduled state.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

const E164 = /^\+[1-9]\d{7,14}$/;

type AudienceKind = "all" | "since" | "custom";
interface Body {
  kind?: AudienceKind;
  since?: string;
  phones?: string[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { id: campaignId } = await params;
  if (!campaignId) {
    return NextResponse.json({ error: "campaign id required" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kind = body.kind ?? "all";
  if (!["all", "since", "custom"].includes(kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }

  // Campaign must belong to tenant and be editable.
  const { data: campaign, error: campaignErr } = await adminSupabaseClient
    .from("marketing_campaigns")
    .select("id, status")
    .eq("id", campaignId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (campaignErr) {
    return NextResponse.json({ error: campaignErr.message }, { status: 500 });
  }
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    return NextResponse.json(
      { error: "Recipients can only be changed while the campaign is in draft or scheduled" },
      { status: 400 }
    );
  }

  // Resolve the actual phone list.
  const phones: { phone: string; name: string | null }[] = [];
  if (kind === "custom") {
    if (!Array.isArray(body.phones)) {
      return NextResponse.json({ error: "phones required for custom kind" }, { status: 400 });
    }
    const seen = new Set<string>();
    for (const raw of body.phones) {
      const p = typeof raw === "string" ? raw.trim() : "";
      if (!E164.test(p)) continue;
      if (seen.has(p)) continue;
      seen.add(p);
      phones.push({ phone: p, name: null });
    }
  } else {
    let q = adminSupabaseClient
      .from("customers")
      .select("phone_number, full_name")
      .eq("restaurant_id", restaurantId)
      .eq("opted_out", false);
    if (kind === "since") {
      if (!body.since) {
        return NextResponse.json(
          { error: "'since' required for kind=since" },
          { status: 400 }
        );
      }
      const d = new Date(body.since);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "invalid since date" }, { status: 400 });
      }
      q = q.gte("last_seen_at", d.toISOString());
    }
    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const row of data ?? []) {
      phones.push({
        phone: row.phone_number,
        name: row.full_name ?? null,
      });
    }
  }

  // Also filter restaurant-level opt_outs just in case a CSV custom list
  // includes them. Already filtered above for customers table rows.
  const { data: optOuts } = await adminSupabaseClient
    .from("opt_outs")
    .select("phone_number")
    .eq("restaurant_id", restaurantId);
  const optOutSet = new Set(
    (optOuts ?? []).map((o: { phone_number: string }) => o.phone_number)
  );
  const finalRows = phones.filter((p) => !optOutSet.has(p.phone));

  // Full-replace the existing recipient set. Small campaigns — no partial-
  // update semantics needed. RLS on campaign_recipients enforces tenant
  // isolation via the campaign FK.
  const { error: delErr } = await adminSupabaseClient
    .from("campaign_recipients")
    .delete()
    .eq("campaign_id", campaignId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (finalRows.length > 0) {
    const now = new Date().toISOString();
    const CHUNK = 500;
    for (let i = 0; i < finalRows.length; i += CHUNK) {
      const chunk = finalRows.slice(i, i + CHUNK).map((r) => ({
        campaign_id: campaignId,
        phone_number: r.phone,
        name: r.name,
        status: "pending" as const,
        created_at: now,
      }));
      const { error: insErr } = await adminSupabaseClient
        .from("campaign_recipients")
        .insert(chunk);
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }
  }

  await adminSupabaseClient
    .from("marketing_campaigns")
    .update({
      total_recipients: finalRows.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return NextResponse.json({
    total_recipients: finalRows.length,
    opted_out_skipped: phones.length - finalRows.length,
  });
}
