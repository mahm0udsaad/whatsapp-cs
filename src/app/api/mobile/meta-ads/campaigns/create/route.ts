/**
 * POST /api/mobile/meta-ads/campaigns/create
 *
 * Creates a full Meta ad campaign in one call:
 *   1. Campaign      (objective)
 *   2. Ad Set        (audience, budget, schedule, optimization + promoted_object)
 *   3. Ad Creative   (image + caption + optional link)
 *   4. Ad            (combines AdSet + Creative)
 *
 * If any step fails the resources created so far are rolled back (deleted) so
 * the ad account is never left with orphaned PAUSED campaigns. Meta's own
 * user-facing error message (`error_user_msg`) is surfaced to the caller.
 *
 * Body:
 *   name:             string                — campaign display name
 *   objective:        MetaObjective         — see buildAdSetConfig below
 *   daily_budget_sar: number                — minor units ×100 (ad-account currency)
 *   start_time:       string (ISO)
 *   end_time?:        string (ISO)          — optional, evergreen if omitted
 *   countries:        string[]              — ISO codes, default ["SA"]
 *   age_min:          number                — 18-65
 *   age_max:          number                — 18-65
 *   caption:          string                — ad copy
 *   image_base64:     string                — required
 *   image_type:       string                — e.g. "image/jpeg"
 *   link_url?:        string                — required for Sales/Leads objectives
 *   launch_now?:      boolean               — if true, status=ACTIVE; else PAUSED
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const META_GRAPH_VERSION = "v23.0";
const STORAGE_BUCKET = "whatsapp-media";

interface CreateBody {
  name?: string;
  objective?: string;
  daily_budget_sar?: number;
  start_time?: string;
  end_time?: string;
  countries?: string[];
  age_min?: number;
  age_max?: number;
  caption?: string;
  image_base64?: string;
  image_type?: string;
  link_url?: string;
  launch_now?: boolean;
}

interface MetaConn {
  user_access_token: string;
  ad_account_id: string;
  page_id: string | null;
  instagram_account_id: string | null;
}

interface AdSetConfig {
  optimization_goal: string;
  billing_event: string;
  promoted_object?: Record<string, unknown>;
}

/** A clean, user-facing error to return without creating anything. */
interface ConfigError {
  error: string;
  status: number;
}

function isConfigError(v: AdSetConfig | ConfigError): v is ConfigError {
  return "error" in v;
}

/**
 * Pull the most user-friendly message out of a Graph API error payload.
 * Meta provides `error_user_msg` (often localized) specifically for surfacing
 * to end users; fall back to the developer message only when it's absent.
 */
function graphErrorMessage(data: Record<string, unknown>): string {
  const e = (data?.error ?? {}) as {
    message?: string;
    error_user_title?: string;
    error_user_msg?: string;
  };
  return (
    e.error_user_msg ||
    e.error_user_title ||
    e.message ||
    "تعذّر إكمال العملية مع Meta. حاول مرة أخرى."
  );
}

async function uploadImageToStorage(
  base64: string,
  mimeType: string,
  restaurantId: string
): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const ext = mimeType.split("/")[1] ?? "jpg";
  const path = `ad-creatives/${restaurantId}/${Date.now()}.${ext}`;

  const { error } = await adminSupabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  // 24h signed URL — Meta hashes the image on its side so it persists past expiry
  const { data: signed } = await adminSupabaseClient.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 86400);
  if (!signed?.signedUrl) throw new Error("Failed to create signed URL");
  return signed.signedUrl;
}

async function graphPost(
  path: string,
  body: Record<string, unknown>,
  token: string
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    params.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  params.set("access_token", token);

  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}${path}`,
    { method: "POST", body: params }
  );
  const data = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, data, status: res.status };
}

/** Best-effort delete of a Graph node — used to roll back partial failures. */
async function graphDelete(id: string, token: string): Promise<void> {
  try {
    await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${id}?` +
        new URLSearchParams({ access_token: token }).toString(),
      { method: "DELETE" }
    );
  } catch {
    // Cleanup is best-effort; a failed delete must not mask the original error.
  }
}

/** Return the first Meta Pixel on the ad account, or null if none exist. */
async function fetchFirstPixelId(
  adAccountId: string,
  token: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${adAccountId}/adspixels?` +
        new URLSearchParams({ fields: "id", access_token: token }).toString()
    );
    const j = (await res.json()) as { data?: { id: string }[] };
    return j.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the ad-set optimization config for a given objective.
 *
 * Three objectives need a `promoted_object` or extra setup that a restaurant
 * may not have. Rather than letting the Graph API reject the ad set with a
 * cryptic error, we validate up front and return a clean, actionable message
 * BEFORE any campaign is created.
 */
async function buildAdSetConfig(
  objective: string,
  body: CreateBody,
  conn: MetaConn
): Promise<AdSetConfig | ConfigError> {
  switch (objective) {
    case "OUTCOME_AWARENESS":
      return { optimization_goal: "REACH", billing_event: "IMPRESSIONS" };

    case "OUTCOME_TRAFFIC":
      return { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS" };

    case "OUTCOME_ENGAGEMENT":
      return { optimization_goal: "POST_ENGAGEMENT", billing_event: "IMPRESSIONS" };

    case "OUTCOME_LEADS": {
      // Website-lead funnel: optimize for landing-page views on the supplied
      // link. (On-Facebook instant forms would need a lead form built first.)
      if (!body.link_url?.trim()) {
        return {
          error:
            "حملة العملاء المحتملين تتطلب إضافة رابط لموقعك في خطوة المحتوى.",
          status: 400,
        };
      }
      return {
        optimization_goal: "LANDING_PAGE_VIEWS",
        billing_event: "IMPRESSIONS",
      };
    }

    case "OUTCOME_SALES": {
      if (!body.link_url?.trim()) {
        return {
          error: "حملة المبيعات تتطلب إضافة رابط متجرك في خطوة المحتوى.",
          status: 400,
        };
      }
      const pixelId = await fetchFirstPixelId(
        conn.ad_account_id,
        conn.user_access_token
      );
      if (!pixelId) {
        return {
          error:
            "حملة المبيعات تتطلب إعداد Meta Pixel على حسابك الإعلاني لتتبّع التحويلات. " +
            "أنشئ Pixel من Meta Events Manager ثم حاول مجددًا.",
          status: 400,
        };
      }
      return {
        optimization_goal: "OFFSITE_CONVERSIONS",
        billing_event: "IMPRESSIONS",
        promoted_object: { pixel_id: pixelId, custom_event_type: "PURCHASE" },
      };
    }

    case "OUTCOME_APP_PROMOTION":
      return {
        error:
          "حملات تنزيل التطبيق غير متاحة حاليًا — تتطلب ربط تطبيق جوّال بحساب Meta.",
        status: 400,
      };

    default:
      return { error: "هدف الحملة غير مدعوم.", status: 400 };
  }
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }

  // Validate required fields
  const required: (keyof CreateBody)[] = [
    "name",
    "objective",
    "daily_budget_sar",
    "start_time",
    "caption",
    "image_base64",
  ];
  for (const k of required) {
    if (!body[k]) {
      return NextResponse.json(
        { error: `الحقل المطلوب مفقود: ${k}` },
        { status: 400 }
      );
    }
  }

  // Load Meta connection
  const { data: conn } = await adminSupabaseClient
    .from("meta_ads_connections")
    .select(
      "user_access_token, ad_account_id, page_id, page_access_token, instagram_account_id"
    )
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!conn?.ad_account_id) {
    return NextResponse.json(
      { error: "لم يتم اختيار حساب إعلاني. اربط حساب Meta أولاً." },
      { status: 404 }
    );
  }
  if (!conn.page_id) {
    return NextResponse.json(
      { error: "اختر صفحة Facebook أولاً — مطلوبة لإنشاء الإعلان." },
      { status: 404 }
    );
  }

  const metaConn: MetaConn = {
    user_access_token: conn.user_access_token,
    ad_account_id: conn.ad_account_id,
    page_id: conn.page_id,
    instagram_account_id: conn.instagram_account_id,
  };

  // Resolve optimization config BEFORE creating anything — so an unsupported
  // objective never leaves an orphaned campaign behind.
  const adSetConfig = await buildAdSetConfig(body.objective!, body, metaConn);
  if (isConfigError(adSetConfig)) {
    return NextResponse.json(
      { error: adSetConfig.error },
      { status: adSetConfig.status }
    );
  }

  // Upload the creative image to Supabase + get a signed URL Meta can fetch
  let imageUrl: string;
  try {
    imageUrl = await uploadImageToStorage(
      body.image_base64!,
      body.image_type ?? "image/jpeg",
      restaurantId
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const token = metaConn.user_access_token;
  const status = body.launch_now ? "ACTIVE" : "PAUSED";
  const adAccountId = metaConn.ad_account_id; // already prefixed with "act_"

  // Track created Graph nodes so we can roll them back on a later failure.
  // Campaign deletion cascades to its ad sets/ads; creatives are account-level
  // and must be deleted on their own.
  const createdForRollback: string[] = [];
  async function rollback(): Promise<void> {
    for (const id of [...createdForRollback].reverse()) {
      await graphDelete(id, token);
    }
  }

  // === Step 1: Campaign ===
  const campaignRes = await graphPost(
    `/${adAccountId}/campaigns`,
    {
      name: body.name,
      objective: body.objective,
      status: "PAUSED", // campaign always paused; status flows through to ad
      special_ad_categories: [],
    },
    token
  );
  if (!campaignRes.ok) {
    return NextResponse.json(
      { error: graphErrorMessage(campaignRes.data), step: "campaign" },
      { status: 502 }
    );
  }
  const campaignId = campaignRes.data.id as string;
  createdForRollback.push(campaignId);

  // === Step 2: Ad Set ===
  const adsetBody: Record<string, unknown> = {
    name: `${body.name} — Ad Set`,
    campaign_id: campaignId,
    daily_budget: Math.round(body.daily_budget_sar! * 100), // major → minor units
    billing_event: adSetConfig.billing_event,
    optimization_goal: adSetConfig.optimization_goal,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: {
      geo_locations: { countries: body.countries ?? ["SA"] },
      age_min: body.age_min ?? 18,
      age_max: body.age_max ?? 65,
      publisher_platforms: ["facebook", "instagram"],
    },
    start_time: body.start_time,
    status: "PAUSED",
  };
  if (body.end_time) adsetBody.end_time = body.end_time;
  if (adSetConfig.promoted_object) {
    adsetBody.promoted_object = adSetConfig.promoted_object;
  }

  const adsetRes = await graphPost(`/${adAccountId}/adsets`, adsetBody, token);
  if (!adsetRes.ok) {
    await rollback();
    return NextResponse.json(
      { error: graphErrorMessage(adsetRes.data), step: "adset" },
      { status: 502 }
    );
  }
  const adsetId = adsetRes.data.id as string;

  // === Step 3: Ad Creative ===
  // If a link URL is provided → link ad; otherwise → photo ad
  const objectStorySpec: Record<string, unknown> = { page_id: metaConn.page_id };
  if (body.link_url?.trim()) {
    objectStorySpec.link_data = {
      message: body.caption,
      link: body.link_url.trim(),
      picture: imageUrl,
    };
  } else {
    objectStorySpec.photo_data = {
      caption: body.caption,
      url: imageUrl,
    };
  }
  // If Instagram is linked, allow IG placements
  if (metaConn.instagram_account_id) {
    objectStorySpec.instagram_actor_id = metaConn.instagram_account_id;
  }

  const creativeRes = await graphPost(
    `/${adAccountId}/adcreatives`,
    {
      name: `${body.name} — Creative`,
      object_story_spec: objectStorySpec,
    },
    token
  );
  if (!creativeRes.ok) {
    await rollback();
    return NextResponse.json(
      { error: graphErrorMessage(creativeRes.data), step: "creative" },
      { status: 502 }
    );
  }
  const creativeId = creativeRes.data.id as string;
  createdForRollback.push(creativeId);

  // === Step 4: Ad ===
  const adRes = await graphPost(
    `/${adAccountId}/ads`,
    {
      name: `${body.name} — Ad`,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status,
    },
    token
  );
  if (!adRes.ok) {
    await rollback();
    return NextResponse.json(
      { error: graphErrorMessage(adRes.data), step: "ad" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    campaign_id: campaignId,
    adset_id: adsetId,
    creative_id: creativeId,
    ad_id: adRes.data.id,
    status,
  });
}
