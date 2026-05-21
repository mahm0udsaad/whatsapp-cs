/**
 * POST /api/mobile/hub/pair
 *   body: { email: string, pairing_code: string }
 *
 * Exchanges the merchant's email + one-time pairing code against the Nehgz
 * central API, then stores the returned access token + base URL for the
 * caller's restaurant. The pairing code is single-use and expires after
 * ~5 minutes, so a failure here just means the user should generate a fresh
 * code from their Nehgz dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { NEHGZ_CENTRAL_URL, hubHeaders } from "@/lib/nehgz-hub";

const WEBHOOK_EVENTS = [
  "booking.created",
  "booking.updated",
  "booking.cancelled",
  "booking.completed",
  "payment.updated",
];

function getOurWebhookUrl(): string | null {
  const base =
    process.env.NEHGZ_WEBHOOK_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/api/webhooks/nehgz`;
}

async function registerHubWebhook(
  baseUrl: string,
  accessToken: string
): Promise<string | null> {
  const webhookUrl = getOurWebhookUrl();
  if (!webhookUrl) {
    console.warn("[hub/pair] no public webhook URL configured — skipping auto-register");
    return null;
  }
  try {
    const res = await fetch(`${baseUrl}/api/v1/webhooks`, {
      method: "PUT",
      headers: hubHeaders(accessToken),
      body: JSON.stringify({ url: webhookUrl, events: WEBHOOK_EVENTS }),
    });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { webhook_secret?: string };
      message?: string;
    } | null;
    if (!res.ok || !json?.success || !json.data?.webhook_secret) {
      console.warn(
        `[hub/pair] webhook register failed status=${res.status} msg=${json?.message ?? "unknown"}`
      );
      return null;
    }
    return json.data.webhook_secret;
  } catch (err) {
    console.warn("[hub/pair] webhook register threw:", err);
    return null;
  }
}

interface PairBody {
  email?: string;
  pairing_code?: string;
}

interface ExchangeResponse {
  success?: boolean;
  message?: string;
  data?: {
    access_token?: string;
    base_url?: string;
    merchant_id?: string;
    merchant?: {
      name?: string;
      phone?: string;
      timezone?: string;
      locale?: string;
    };
  };
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let body: PairBody;
  try {
    body = (await request.json()) as PairBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  const pairingCode = body.pairing_code?.trim();
  if (!email || !pairingCode) {
    return NextResponse.json(
      { error: "email and pairing_code are required" },
      { status: 400 }
    );
  }

  let exchange: ExchangeResponse;
  try {
    const res = await fetch(`${NEHGZ_CENTRAL_URL}/api/v1/tokens/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, pairing_code: pairingCode }),
    });
    exchange = (await res.json()) as ExchangeResponse;
    if (!res.ok || !exchange.success) {
      return NextResponse.json(
        {
          error:
            exchange.message ??
            "Pairing failed — generate a fresh code and try again",
        },
        { status: res.status === 200 ? 400 : res.status }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not reach the Nehgz central API" },
      { status: 502 }
    );
  }

  const data = exchange.data;
  if (!data?.access_token || !data?.base_url) {
    return NextResponse.json(
      { error: "Central API did not return an access token" },
      { status: 502 }
    );
  }

  // Drop any trailing slash so proxied paths join cleanly.
  const baseUrl = data.base_url.replace(/\/+$/, "");

  // Auto-register our webhook receiver so booking events flow without a
  // manual Postman step. Failure here is non-fatal — pairing still succeeds
  // and the merchant can re-pair to retry.
  const webhookSecret = await registerHubWebhook(baseUrl, data.access_token);

  const { error } = await adminSupabaseClient
    .from("nehgz_hub_connections")
    .upsert(
      {
        restaurant_id: restaurantId,
        access_token: data.access_token,
        base_url: baseUrl,
        merchant_id: data.merchant_id ?? null,
        merchant_name: data.merchant?.name ?? null,
        merchant_phone: data.merchant?.phone ?? null,
        merchant_timezone: data.merchant?.timezone ?? null,
        merchant_locale: data.merchant?.locale ?? null,
        webhook_secret: webhookSecret,
        paired_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    paired: true,
    webhookRegistered: webhookSecret !== null,
    merchant: {
      id: data.merchant_id ?? null,
      name: data.merchant?.name ?? null,
      phone: data.merchant?.phone ?? null,
      timezone: data.merchant?.timezone ?? null,
      locale: data.merchant?.locale ?? null,
    },
  });
}
