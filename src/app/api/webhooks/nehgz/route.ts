/**
 * POST /api/webhooks/nehgz
 *
 * Receives booking + payment events pushed by the Nehgz Hub. For each event:
 *   1) Parse the raw body and identify which restaurant this is for, using
 *      the `merchant_id` field on the payload (matched against
 *      nehgz_hub_connections.merchant_id).
 *   2) Best-effort verify the signature using the per-merchant webhook_secret.
 *      If `NEHGZ_WEBHOOK_STRICT=true`, reject invalid signatures with 401.
 *      Otherwise we log a warning and still process — same posture as the
 *      Twilio receiver in this codebase.
 *   3) Insert into nehgz_webhook_events keyed on event_id (idempotent).
 *      A duplicate delivery is ACKed 200 with no fanout.
 *   4) Trigger push fanout to the restaurant's team members.
 *   5) Always respond 200 once the event row is persisted, so the Hub doesn't
 *      retry. Replay is available through GET /api/v1/webhooks/events on
 *      the Hub side if we lose an event.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  notifyMerchantOfNehgzEvent,
  type NehgzWebhookPayload,
} from "@/lib/nehgz-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRICT = process.env.NEHGZ_WEBHOOK_STRICT === "true";

interface HubConnectionRow {
  restaurant_id: string;
  merchant_id: string | null;
  webhook_secret: string | null;
}

/**
 * Verify the signature using the scheme we asked the Nehgz Hub to implement:
 *
 *   X-Nehgz-Timestamp: <unix seconds>
 *   X-Nehgz-Signature: sha256=<lowercase hex HMAC-SHA256>
 *
 *   signed_payload = `${timestamp}.${raw body}`
 *   key            = webhook_secret with the `whsec_` prefix stripped
 *
 * We also reject timestamps older than TOLERANCE_SECONDS to prevent replay
 * of a captured signed payload.
 */
const TOLERANCE_SECONDS = 5 * 60;

function verifySignature(
  rawBody: string,
  headers: Headers,
  secret: string
): boolean {
  if (!secret) return false;
  const timestamp = headers.get("x-nehgz-timestamp");
  const signature = headers.get("x-nehgz-signature");
  if (!timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > TOLERANCE_SECONDS) return false;

  const key = secret.startsWith("whsec_")
    ? secret.slice("whsec_".length)
    : secret;
  const provided = signature.replace(/^sha256=/, "").trim().toLowerCase();
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let payload: NehgzWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as NehgzWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload?.event_id || !payload?.event) {
    return NextResponse.json(
      { error: "Missing event_id or event" },
      { status: 400 }
    );
  }

  const merchantId = payload.merchant_id?.trim();
  if (!merchantId) {
    return NextResponse.json(
      { error: "Missing merchant_id on payload" },
      { status: 400 }
    );
  }

  // Resolve restaurant by merchant_id.
  const { data: conn, error: connErr } = await adminSupabaseClient
    .from("nehgz_hub_connections")
    .select("restaurant_id, merchant_id, webhook_secret")
    .eq("merchant_id", merchantId)
    .maybeSingle<HubConnectionRow>();
  if (connErr) {
    console.error("[nehgz-webhook] connection lookup failed:", connErr.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  if (!conn) {
    console.warn(`[nehgz-webhook] unknown merchant_id=${merchantId}`);
    return NextResponse.json({ error: "Unknown merchant" }, { status: 404 });
  }

  // Signature verification (best-effort unless strict).
  const sigOk = conn.webhook_secret
    ? verifySignature(rawBody, request.headers, conn.webhook_secret)
    : false;
  if (!sigOk) {
    if (STRICT) {
      console.warn(
        `[nehgz-webhook] signature mismatch (strict) merchant=${merchantId} event=${payload.event_id}`
      );
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    console.warn(
      `[nehgz-webhook] signature mismatch (soft) merchant=${merchantId} event=${payload.event_id} — processing anyway`
    );
  }

  // Idempotent insert. PK on event_id guarantees we ACK duplicates without
  // re-firing the push.
  const occurredAt = payload.occurred_at
    ? new Date(payload.occurred_at.replace(" ", "T") + "Z").toISOString()
    : null;

  const { error: insertErr, count } = await adminSupabaseClient
    .from("nehgz_webhook_events")
    .upsert(
      {
        event_id: payload.event_id,
        restaurant_id: conn.restaurant_id,
        merchant_id: merchantId,
        event: payload.event,
        occurred_at: occurredAt,
        payload,
      },
      { onConflict: "event_id", ignoreDuplicates: true, count: "exact" }
    );
  if (insertErr) {
    console.error("[nehgz-webhook] persist failed:", insertErr.message);
    return NextResponse.json({ error: "Persist failed" }, { status: 500 });
  }
  const isDuplicate = (count ?? 0) === 0;
  if (isDuplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Fanout pushes. We await so any error is logged, but always ACK 200 —
  // the row is persisted and can be retried via the Hub's replay endpoint.
  try {
    const sendResult = await notifyMerchantOfNehgzEvent(
      conn.restaurant_id,
      payload
    );
    await adminSupabaseClient
      .from("nehgz_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", payload.event_id);
    return NextResponse.json({ ok: true, ...sendResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await adminSupabaseClient
      .from("nehgz_webhook_events")
      .update({ process_error: message })
      .eq("event_id", payload.event_id);
    console.error("[nehgz-webhook] fanout failed:", message);
    return NextResponse.json({ ok: true, error: message });
  }
}
