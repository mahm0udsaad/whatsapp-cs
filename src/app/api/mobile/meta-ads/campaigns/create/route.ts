/**
 * POST /api/mobile/meta-ads/campaigns/create
 *
 * Creates a full Meta ad campaign in one call:
 *   1. Campaign      (objective)
 *   2. Ad Set        (audience, budget, schedule)
 *   3. Ad Creative   (image + caption + optional link)
 *   4. Ad            (combines AdSet + Creative)
 *
 * Always creates as PAUSED so the user can review in Meta Ads Manager before
 * spending money. Caller can then activate via PATCH /campaigns/[id].
 *
 * Body:
 *   name:             string                — campaign display name
 *   objective:        MetaObjective         — see OBJECTIVE_DEFAULTS below
 *   daily_budget_sar: number                — SAR, will be ×100 to halalas
 *   start_time:       string (ISO)
 *   end_time?:        string (ISO)          — optional, evergreen if omitted
 *   countries:        string[]              — ISO codes, default ["SA"]
 *   age_min:          number                — 18-65
 *   age_max:          number                — 18-65
 *   caption:          string                — ad copy
 *   image_base64:     string                — required
 *   image_type:       string                — e.g. "image/jpeg"
 *   link_url?:        string                — optional click destination
 *   launch_now?:      boolean               — if true, status=ACTIVE; else PAUSED
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const META_GRAPH_VERSION = "v21.0";
const STORAGE_BUCKET = "whatsapp-media";

// Map Meta ODAX objective → optimization_goal → billing_event
const OBJECTIVE_DEFAULTS: Record<
  string,
  { optimization_goal: string; billing_event: string }
> = {
  OUTCOME_AWARENESS: { optimization_goal: "REACH", billing_event: "IMPRESSIONS" },
  OUTCOME_TRAFFIC: { optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS" },
  OUTCOME_ENGAGEMENT: { optimization_goal: "POST_ENGAGEMENT", billing_event: "IMPRESSIONS" },
  OUTCOME_LEADS: { optimization_goal: "LEAD_GENERATION", billing_event: "IMPRESSIONS" },
  OUTCOME_SALES: { optimization_goal: "OFFSITE_CONVERSIONS", billing_event: "IMPRESSIONS" },
  OUTCOME_APP_PROMOTION: { optimization_goal: "APP_INSTALLS", billing_event: "IMPRESSIONS" },
};

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

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate
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
      return NextResponse.json({ error: `${k} is required` }, { status: 400 });
    }
  }

  const objCfg = OBJECTIVE_DEFAULTS[body.objective!];
  if (!objCfg) {
    return NextResponse.json({ error: "Invalid objective" }, { status: 400 });
  }

  // Load Meta connection
  const { data: conn } = await adminSupabaseClient
    .from("meta_ads_connections")
    .select("user_access_token, ad_account_id, page_id, page_access_token, instagram_account_id")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!conn?.ad_account_id) {
    return NextResponse.json({ error: "No ad account selected" }, { status: 404 });
  }
  if (!conn.page_id) {
    return NextResponse.json(
      { error: "Connect a Facebook Page first (required for the ad creative)" },
      { status: 404 }
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

  const token = conn.user_access_token;
  const status = body.launch_now ? "ACTIVE" : "PAUSED";
  const adAccountId = conn.ad_account_id; // already prefixed with "act_"

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
      { error: "campaign step failed", details: campaignRes.data, step: "campaign" },
      { status: 502 }
    );
  }
  const campaignId = campaignRes.data.id as string;

  // === Step 2: Ad Set ===
  const adsetBody: Record<string, unknown> = {
    name: `${body.name} — Ad Set`,
    campaign_id: campaignId,
    daily_budget: Math.round(body.daily_budget_sar! * 100), // SAR → halalas
    billing_event: objCfg.billing_event,
    optimization_goal: objCfg.optimization_goal,
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

  const adsetRes = await graphPost(`/${adAccountId}/adsets`, adsetBody, token);
  if (!adsetRes.ok) {
    return NextResponse.json(
      { error: "adset step failed", details: adsetRes.data, step: "adset", campaign_id: campaignId },
      { status: 502 }
    );
  }
  const adsetId = adsetRes.data.id as string;

  // === Step 3: Ad Creative ===
  // If a link URL is provided → link ad; otherwise → photo ad
  const objectStorySpec: Record<string, unknown> = { page_id: conn.page_id };
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
  if (conn.instagram_account_id) {
    objectStorySpec.instagram_actor_id = conn.instagram_account_id;
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
    return NextResponse.json(
      {
        error: "creative step failed",
        details: creativeRes.data,
        step: "creative",
        campaign_id: campaignId,
        adset_id: adsetId,
      },
      { status: 502 }
    );
  }
  const creativeId = creativeRes.data.id as string;

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
    return NextResponse.json(
      {
        error: "ad step failed",
        details: adRes.data,
        step: "ad",
        campaign_id: campaignId,
        adset_id: adsetId,
        creative_id: creativeId,
      },
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
