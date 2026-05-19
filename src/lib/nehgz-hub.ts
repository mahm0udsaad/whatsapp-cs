/**
 * Shared helpers for the Nehgz Hub integration.
 *
 * The integration has two hosts:
 *   - Central API (NEHGZ_CENTRAL_URL): only used to exchange an email + one-time
 *     pairing code for a per-merchant access token and base URL.
 *   - Per-merchant API (base_url, stored per restaurant): every other endpoint.
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export const NEHGZ_CENTRAL_URL =
  process.env.NEHGZ_CENTRAL_URL ?? "https://nehgz-sa.com";

export interface HubConnection {
  restaurant_id: string;
  access_token: string;
  base_url: string;
  merchant_id: string | null;
  merchant_name: string | null;
  merchant_phone: string | null;
  merchant_timezone: string | null;
  merchant_locale: string | null;
  webhook_secret: string | null;
  paired_at: string;
}

/** Standard headers every Hub request carries (mirrors the Postman collection). */
export function hubHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Language": "ar",
  };
}

/**
 * Load the Hub connection for a restaurant, or return a 404 NextResponse
 * signalling the client must pair first.
 */
export async function getHubConnection(
  restaurantId: string
): Promise<HubConnection | NextResponse> {
  const { data } = await adminSupabaseClient
    .from("nehgz_hub_connections")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json(
      { error: "Not paired with Nehgz Hub", code: "not_paired" },
      { status: 404 }
    );
  }
  return data as HubConnection;
}
