/**
 * ALL /api/mobile/hub/proxy/[...path]
 *
 * Generic proxy to the per-merchant Nehgz Hub API. Forwards the method, query
 * string and body to `{base_url}/api/v1/{path}` with the stored access token
 * and the standard Hub headers. This single route backs every Hub endpoint
 * (merchant, availability, staff, bookings, services, payments, webhooks).
 *
 * A 401 from the Hub means the stored token is no longer valid — we surface
 * `code: "repair_needed"` so the client can bounce the user back to pairing.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { getHubConnection, hubHeaders } from "@/lib/nehgz-hub";

// Only these top-level Hub resources may be proxied. Keeps the open-ended
// catch-all from being pointed at arbitrary hosts/paths.
const ALLOWED_PREFIXES = [
  "merchant",
  "availability",
  "staff",
  "bookings",
  "dashboard",
  "reports",
  "customers",
  "webhooks",
  "services",
  "payments",
];

async function proxy(
  request: NextRequest,
  ctxPromise: Promise<{ params: Promise<{ path: string[] }> }>
) {
  const auth = await resolveCurrentRestaurantForAdmin();
  if (auth instanceof NextResponse) return auth;

  const conn = await getHubConnection(auth.restaurantId);
  if (conn instanceof NextResponse) return conn;

  const { params } = await ctxPromise;
  const { path } = await params;
  const segments = path ?? [];
  if (segments.length === 0 || !ALLOWED_PREFIXES.includes(segments[0])) {
    return NextResponse.json(
      { error: "Unknown Hub resource" },
      { status: 404 }
    );
  }

  const search = request.nextUrl.search;
  const target = `${conn.base_url}/api/v1/${segments.join("/")}${search}`;

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD" && method !== "DELETE";
  const body = hasBody ? await request.text() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers: hubHeaders(conn.access_token),
      body: body && body.length > 0 ? body : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the Nehgz Hub API" },
      { status: 502 }
    );
  }

  if (upstream.status === 401) {
    return NextResponse.json(
      { error: "Nehgz Hub session expired — pair again", code: "repair_needed" },
      { status: 401 }
    );
  }

  const payload = await upstream.text();
  const contentType =
    upstream.headers.get("content-type") ?? "application/json";

  return new NextResponse(payload, {
    status: upstream.status,
    headers: { "content-type": contentType },
  });
}

export function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, Promise.resolve(context));
}
export const POST = GET;
export const PATCH = GET;
export const PUT = GET;
export const DELETE = GET;
