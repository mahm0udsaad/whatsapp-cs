/**
 * POST /api/internal/escalation-timeout-sweep
 *
 * Responsibilities:
 *   - Find escalation orders that have been unclaimed for > 3 minutes and
 *     have not yet been escalated to the tenant owner (Hanan).
 *   - Push-notify the owner (via any push tokens we can find) and stamp
 *     orders.hanan_escalated_at so we don't re-notify.
 *
 * Designed to be invoked every minute by Vercel Cron.
 *
 * Auth: shared Bearer secret — CRON_SECRET (Vercel auto-injected) or
 *   AI_REPLY_WORKER_SECRET (manual callers). Same pattern as
 *   /api/internal/process-ai-replies.
 *
 * Phone redaction: customer_phone is masked to last 4 digits in push bodies
 * and logs.
 *
 * Token lookup strategy for the owner:
 *   1. user_push_tokens rows belonging to any team_member whose user_id
 *      equals the owner (owners often have a team_members shim row).
 *   2. Fallback: profiles.expo_push_token column (if present — gracefully
 *      ignored on schemas without it).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { sendExpoPush, type ExpoPushMessage } from "@/lib/expo-push";

const SWEEP_LIMIT = 100;
const UNCLAIMED_MINUTES = 3;

function isAuthorized(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.replace(/^Bearer\s+/i, "");

  if (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) {
    return true;
  }
  if (
    process.env.AI_REPLY_WORKER_SECRET &&
    bearer === process.env.AI_REPLY_WORKER_SECRET
  ) {
    return true;
  }
  return false;
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "***";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return `***${digits}`;
  return `***${digits.slice(-4)}`;
}

function truncate(s: string | null | undefined, n: number): string {
  const v = (s ?? "").trim();
  return v.length <= n ? v : v.slice(0, n).trimEnd();
}

interface StaleOrder {
  id: string;
  restaurant_id: string;
  conversation_id: string;
  customer_phone: string | null;
  details: string | null;
}

async function collectOwnerTokens(
  restaurantId: string
): Promise<string[]> {
  // Step 1: find owner user_id via restaurants.owner_id
  const { data: restaurant, error: restaurantErr } = await adminSupabaseClient
    .from("restaurants")
    .select("owner_id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (restaurantErr || !restaurant?.owner_id) return [];

  const ownerUserId = restaurant.owner_id as string;

  // Step 2: find team_members rows for this owner in this tenant
  const { data: memberRows } = await adminSupabaseClient
    .from("team_members")
    .select("id")
    .eq("user_id", ownerUserId)
    .eq("restaurant_id", restaurantId);

  const tokens: string[] = [];

  if (memberRows && memberRows.length > 0) {
    const memberIds = memberRows.map((r) => r.id as string);
    const { data: pushRows } = await adminSupabaseClient
      .from("user_push_tokens")
      .select("expo_token")
      .in("team_member_id", memberIds)
      .eq("disabled", false);
    if (pushRows) {
      for (const r of pushRows) {
        if (r.expo_token) tokens.push(r.expo_token as string);
      }
    }
  }

  // Step 3 (fallback): profiles.expo_push_token if the column exists.
  try {
    const { data: profile, error } = await adminSupabaseClient
      .from("profiles")
      .select("expo_push_token")
      .eq("id", ownerUserId)
      .maybeSingle();
    // Column may not exist on this deployment; ignore "column does not exist".
    if (!error && profile && (profile as Record<string, unknown>).expo_push_token) {
      const tok = (profile as Record<string, unknown>).expo_push_token as string;
      if (tok && !tokens.includes(tok)) tokens.push(tok);
    }
  } catch {
    // No-op: column may not exist in this schema.
  }

  return tokens;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cutoff = new Date(
      Date.now() - UNCLAIMED_MINUTES * 60 * 1000
    ).toISOString();

    const { data: stale, error } = await adminSupabaseClient
      .from("orders")
      .select("id, restaurant_id, conversation_id, customer_phone, details")
      .eq("type", "escalation")
      .is("assigned_to", null)
      .is("hanan_escalated_at", null)
      .lt("created_at", cutoff)
      .limit(SWEEP_LIMIT);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orders: StaleOrder[] = (stale || []) as StaleOrder[];
    if (orders.length === 0) {
      return NextResponse.json(
        { escalated: 0, pushSent: 0, pushInvalid: 0 },
        { status: 200 }
      );
    }

    let totalSent = 0;
    let totalInvalid = 0;
    let escalatedCount = 0;

    for (const order of orders) {
      const tokens = await collectOwnerTokens(order.restaurant_id);

      if (tokens.length > 0) {
        const maskedPhone = maskPhone(order.customer_phone);
        const bodyText = `${maskedPhone} — ${truncate(order.details, 60)}`.trim();

        const messages: ExpoPushMessage[] = tokens.map((t) => ({
          to: t,
          title: "لم يرد أحد — طلب عميل ينتظر",
          body: bodyText,
          data: {
            orderId: order.id,
            restaurantId: order.restaurant_id,
            conversationId: order.conversation_id,
            type: "escalation_timeout",
          },
          priority: "high",
          channelId: "escalations",
          sound: "default",
        }));

        const result = await sendExpoPush(messages);
        totalSent += result.sent;
        totalInvalid += result.invalidTokens.length;

        if (result.invalidTokens.length > 0) {
          await adminSupabaseClient
            .from("user_push_tokens")
            .update({ disabled: true })
            .in("expo_token", result.invalidTokens);
        }
      }

      // Stamp hanan_escalated_at regardless of push success — we're out of
      // runway and must not re-notify forever.
      const { error: stampErr } = await adminSupabaseClient
        .from("orders")
        .update({ hanan_escalated_at: new Date().toISOString() })
        .eq("id", order.id)
        .is("hanan_escalated_at", null);
      if (!stampErr) escalatedCount += 1;

      console.log(
        `[timeout-sweep] order=${order.id} phone=${maskPhone(order.customer_phone)} tokens=${tokens.length} sent=${totalSent} invalid=${totalInvalid}`
      );
    }

    return NextResponse.json(
      {
        escalated: escalatedCount,
        pushSent: totalSent,
        pushInvalid: totalInvalid,
        scanned: orders.length,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
