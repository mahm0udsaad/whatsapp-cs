/**
 * GET  /api/mobile/meta-ads/pages  — list Facebook Pages the user manages
 * POST /api/mobile/meta-ads/pages  — save selected page + fetch its linked Instagram account
 *   body: { page_id: string, page_name: string, page_access_token: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const META_GRAPH_VERSION = "v23.0";

const PAGE_FIELDS =
  "id,name,category,fan_count,access_token,instagram_business_account{id,username}";

interface GraphPage {
  id: string;
  name?: string;
  category?: string;
  fan_count?: number;
  access_token?: string;
  instagram_business_account?: { id: string; username: string };
}

function graphGet<T>(path: string, query: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(query).toString();
  return fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}${path}?${qs}`).then(
    (r) => r.json() as Promise<T>
  );
}

/**
 * Collect every Page the user can manage, from both:
 *   - /me/accounts                     — classic Pages with a direct role
 *   - /{business}/owned_pages + client_pages — New Pages Experience / Business
 *     Portfolio pages, which never show up under /me/accounts
 * Business lookups require the `business_management` scope; if the stored token
 * predates that scope the call errors and we silently fall back to the classic
 * list. Pages without a page access token can't be posted to, so they're dropped
 * after a best-effort token backfill.
 */
async function collectManageablePages(userToken: string): Promise<GraphPage[]> {
  const byId = new Map<string, GraphPage>();
  const add = (p: GraphPage) => {
    if (p?.id && !byId.has(p.id)) byId.set(p.id, p);
  };

  const classic = await graphGet<{ data?: GraphPage[]; error?: unknown }>(
    "/me/accounts",
    { fields: PAGE_FIELDS, limit: "100", access_token: userToken }
  );
  for (const p of classic.data ?? []) add(p);

  // Business-portfolio pages (best-effort — needs business_management).
  try {
    const biz = await graphGet<{ data?: { id: string }[] }>("/me/businesses", {
      fields: "id",
      limit: "50",
      access_token: userToken,
    });
    for (const b of biz.data ?? []) {
      for (const edge of ["owned_pages", "client_pages"]) {
        const bp = await graphGet<{ data?: GraphPage[] }>(`/${b.id}/${edge}`, {
          fields: PAGE_FIELDS,
          limit: "100",
          access_token: userToken,
        });
        for (const p of bp.data ?? []) add(p);
      }
    }
  } catch {
    // Business lookup is optional; classic pages still returned.
  }

  // Business pages often omit access_token — fetch each missing one directly.
  await Promise.all(
    [...byId.values()]
      .filter((p) => !p.access_token)
      .map(async (p) => {
        const single = await graphGet<GraphPage>(`/${p.id}`, {
          fields: `access_token,name,category,instagram_business_account{id,username}`,
          access_token: userToken,
        });
        if (single.access_token) {
          p.access_token = single.access_token;
          if (!p.instagram_business_account && single.instagram_business_account) {
            p.instagram_business_account = single.instagram_business_account;
          }
        }
      })
  );

  // Only Pages we can actually post to (need a page access token).
  return [...byId.values()].filter((p) => p.access_token);
}

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { data: conn } = await adminSupabaseClient
    .from("meta_ads_connections")
    .select("user_access_token")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({ error: "Not connected to Meta" }, { status: 404 });
  }

  try {
    const pages = await collectManageablePages(conn.user_access_token);
    return NextResponse.json(pages);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

interface SelectPageBody {
  page_id?: string;
  page_name?: string;
  page_access_token?: string;
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let body: SelectPageBody;
  try {
    body = (await request.json()) as SelectPageBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.page_id?.trim() || !body.page_access_token?.trim()) {
    return NextResponse.json({ error: "page_id and page_access_token required" }, { status: 400 });
  }

  // Fetch the linked Instagram Business account for this page
  let instagramAccountId: string | null = null;
  let instagramUsername: string | null = null;

  try {
    const igParams = new URLSearchParams({
      fields: "instagram_business_account{id,username}",
      access_token: body.page_access_token.trim(),
    });
    const igRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${body.page_id.trim()}?${igParams.toString()}`
    );
    const igData = (await igRes.json()) as {
      instagram_business_account?: { id: string; username: string };
    };
    if (igData.instagram_business_account) {
      instagramAccountId = igData.instagram_business_account.id;
      instagramUsername = igData.instagram_business_account.username;
    }
  } catch {
    // Instagram linking is optional — continue without it
  }

  const { error } = await adminSupabaseClient
    .from("meta_ads_connections")
    .update({
      page_id: body.page_id.trim(),
      page_name: body.page_name?.trim() ?? null,
      page_access_token: body.page_access_token.trim(),
      instagram_account_id: instagramAccountId,
      instagram_username: instagramUsername,
    })
    .eq("restaurant_id", restaurantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    instagramLinked: Boolean(instagramAccountId),
    instagramUsername,
  });
}
