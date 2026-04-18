/**
 * POST /api/internal/broadcast-escalation
 *
 * Responsibilities:
 *   - Accept `{ orderId }` from a trusted internal caller.
 *   - Fan a push notification out to every currently on-duty team_member for
 *     that order's tenant.
 *   - Flip Expo-reported invalid tokens to `disabled = true` in user_push_tokens.
 *   - Return compact counts: { sent, skipped, invalid, onDutyCount }.
 *
 * Auth: shared-secret Bearer header, matching the process-ai-replies pattern.
 *   Accepts CRON_SECRET (Vercel) or AI_REPLY_WORKER_SECRET as fallback.
 *
 * Best-effort semantics:
 *   - If the order is already claimed (assigned_to IS NOT NULL) or already
 *     escalated to Hanan (hanan_escalated_at IS NOT NULL), we no-op with 200.
 *   - If no on-duty agents have active push tokens, we still return 200.
 *
 * Phone redaction: customer_phone is masked to the last 4 digits in push
 * bodies AND in log lines.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { sendExpoPush, type ExpoPushMessage } from "@/lib/expo-push";

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

interface OnDutyAgent {
  team_member_id: string;
  user_id: string;
  full_name: string | null;
  role: string;
  is_available: boolean | null;
  shift_starts_at: string;
  shift_ends_at: string;
  note: string | null;
}

interface PushTokenRow {
  id: string;
  expo_token: string;
  team_member_id: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { orderId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const orderId = body.orderId?.trim();
    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    // 1. Load the order
    const { data: order, error: orderErr } = await adminSupabaseClient
      .from("orders")
      .select(
        "id, restaurant_id, conversation_id, customer_phone, details, type, assigned_to, hanan_escalated_at"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // No-op paths (idempotent)
    if (order.assigned_to || order.hanan_escalated_at) {
      return NextResponse.json(
        {
          sent: 0,
          skipped: 0,
          invalid: 0,
          onDutyCount: 0,
          skippedReason: order.assigned_to ? "already_claimed" : "already_escalated",
        },
        { status: 200 }
      );
    }

    // 2. On-duty agents
    const { data: onDuty, error: onDutyErr } = await adminSupabaseClient.rpc(
      "current_on_duty_agents",
      { p_restaurant_id: order.restaurant_id }
    );
    if (onDutyErr) {
      return NextResponse.json({ error: onDutyErr.message }, { status: 500 });
    }

    const agents: OnDutyAgent[] = (onDuty || []) as OnDutyAgent[];
    const available = agents.filter((a) => a.is_available !== false);
    const onDutyCount = available.length;

    if (onDutyCount === 0) {
      console.log(
        `[broadcast] order=${orderId} sent=0 skipped=0 invalid=0 (no on-duty agents)`
      );
      return NextResponse.json(
        { sent: 0, skipped: 0, invalid: 0, onDutyCount: 0 },
        { status: 200 }
      );
    }

    // 3. Push tokens for those agents
    const memberIds = available.map((a) => a.team_member_id);
    const { data: tokens, error: tokensErr } = await adminSupabaseClient
      .from("user_push_tokens")
      .select("id, expo_token, team_member_id")
      .in("team_member_id", memberIds)
      .eq("disabled", false);

    if (tokensErr) {
      return NextResponse.json({ error: tokensErr.message }, { status: 500 });
    }

    const tokenRows: PushTokenRow[] = (tokens || []) as PushTokenRow[];

    if (tokenRows.length === 0) {
      console.log(
        `[broadcast] order=${orderId} sent=0 skipped=0 invalid=0 onDuty=${onDutyCount} (no tokens)`
      );
      return NextResponse.json(
        { sent: 0, skipped: 0, invalid: 0, onDutyCount },
        { status: 200 }
      );
    }

    // 4. Build push messages
    const maskedPhone = maskPhone(order.customer_phone);
    const detailsSnippet = truncate(order.details, 60);
    const bodyText = `${maskedPhone} — ${detailsSnippet}`.trim();

    const messages: ExpoPushMessage[] = tokenRows.map((row) => ({
      to: row.expo_token,
      title: "محادثة جديدة تحتاج تدخّل",
      body: bodyText,
      data: {
        orderId: order.id,
        restaurantId: order.restaurant_id,
        conversationId: order.conversation_id,
        type: "escalation",
      },
      priority: "high",
      channelId: "escalations",
      sound: "default",
    }));

    // 5. Send
    const result = await sendExpoPush(messages);

    // 6. Disable invalid tokens
    if (result.invalidTokens.length > 0) {
      const { error: disableErr } = await adminSupabaseClient
        .from("user_push_tokens")
        .update({ disabled: true })
        .in("expo_token", result.invalidTokens);
      if (disableErr) {
        console.error(
          `[broadcast] failed to disable ${result.invalidTokens.length} invalid tokens:`,
          disableErr.message
        );
      }
    }

    console.log(
      `[broadcast] order=${orderId} sent=${result.sent} skipped=${result.skipped} invalid=${result.invalidTokens.length} onDuty=${onDutyCount}`
    );

    return NextResponse.json(
      {
        sent: result.sent,
        skipped: result.skipped,
        invalid: result.invalidTokens.length,
        onDutyCount,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
