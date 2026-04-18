/**
 * GET /api/internal/sla-sweep
 *
 * Cron-only. Finds conversations that have been unassigned for >5 minutes
 * (using last_inbound_at) and haven't been notified about in the last 10
 * minutes, then pushes an SLA-breach alert to the tenant's managers.
 *
 * Authorization: caller must present x-cron-secret header matching
 * process.env.CRON_SECRET. A request without the header (or wrong value)
 * is rejected with 401.
 *
 * Intended schedule: every minute (Vercel cron entry).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { notifyManagersOfSlaBreach } from "@/lib/conversation-notifications";

const SLA_MINUTES = 5;
const SUPPRESS_MINUTES = 10;

export async function GET(request: NextRequest) {
  const providedSecret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected || providedSecret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const breachThreshold = new Date(
    Date.now() - SLA_MINUTES * 60_000
  ).toISOString();
  const suppressThreshold = new Date(
    Date.now() - SUPPRESS_MINUTES * 60_000
  ).toISOString();

  // 1. Candidate conversations: unassigned, active, last_inbound_at older
  //    than the SLA threshold.
  const { data: conversations, error } = await adminSupabaseClient
    .from("conversations")
    .select(
      "id, restaurant_id, customer_name, customer_phone, last_inbound_at"
    )
    .eq("handler_mode", "unassigned")
    .eq("status", "active")
    .lte("last_inbound_at", breachThreshold)
    .not("last_inbound_at", "is", null)
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ scanned: 0, notified: 0 });
  }

  // 2. Filter out conversations that already fired a breach notification
  //    inside the suppression window.
  const convIds = conversations.map((c) => c.id);
  const { data: recent } = await adminSupabaseClient
    .from("sla_notification_log")
    .select("conversation_id")
    .in("conversation_id", convIds)
    .eq("notification_type", "sla_breach")
    .gte("notified_at", suppressThreshold);
  const suppressed = new Set((recent ?? []).map((r) => r.conversation_id));

  const toNotify = conversations.filter((c) => !suppressed.has(c.id));
  if (toNotify.length === 0) {
    return NextResponse.json({
      scanned: conversations.length,
      notified: 0,
    });
  }

  // 3. Grab a preview message per conversation (last inbound).
  const { data: previews } = await adminSupabaseClient
    .from("messages")
    .select("conversation_id, content, created_at")
    .in(
      "conversation_id",
      toNotify.map((c) => c.id)
    )
    .eq("role", "customer")
    .order("created_at", { ascending: false });
  const previewMap = new Map<string, string>();
  for (const m of previews ?? []) {
    if (!previewMap.has(m.conversation_id)) {
      previewMap.set(m.conversation_id, m.content ?? "");
    }
  }

  // 4. Fire notifications + log.
  let notified = 0;
  for (const conv of toNotify) {
    try {
      await notifyManagersOfSlaBreach(conv.restaurant_id, conv.id, {
        customerName: conv.customer_name,
        customerPhone: conv.customer_phone,
        body: previewMap.get(conv.id) ?? "رسالة جديدة",
      });
      await adminSupabaseClient.from("sla_notification_log").insert({
        restaurant_id: conv.restaurant_id,
        conversation_id: conv.id,
        notification_type: "sla_breach",
      });
      notified++;
    } catch (err) {
      console.warn(
        `[sla-sweep] notify failed for conv ${conv.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return NextResponse.json({ scanned: conversations.length, notified });
}
