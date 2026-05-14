/**
 * POST /api/mobile/meta-ads/ai/caption
 *
 * Generates 3 Arabic caption variants for a social post using Gemini.
 * Body: { hint?: string, platform: "instagram" | "facebook", has_image?: boolean }
 *
 * Required env: GOOGLE_GEMINI_API_KEY
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { incrementAiUsage, getAiUsage } from "@/lib/ai-usage";

const GEMINI_TEXT_MODEL = "gemini-2.5-flash";

interface CaptionBody {
  hint?: string;
  platform?: "instagram" | "facebook";
  has_image?: boolean;
}

interface RestaurantContext {
  name: string;
  description: string | null;
}

async function fetchRestaurantContext(
  restaurantId: string
): Promise<RestaurantContext> {
  // Best-effort: try common columns; missing ones return null silently.
  const { data } = await adminSupabaseClient
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .maybeSingle();

  if (!data) return { name: "النشاط التجاري", description: null };

  const r = data as Record<string, unknown>;
  const name =
    (r.business_name as string) ||
    (r.name as string) ||
    (r.display_name as string) ||
    "النشاط التجاري";
  const description =
    (r.description as string) ||
    (r.bio as string) ||
    (r.about as string) ||
    null;

  return { name, description };
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  let body: CaptionBody;
  try {
    body = (await request.json()) as CaptionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Soft limit check
  const currentUsage = await getAiUsage(restaurantId, "caption");
  if (currentUsage.remaining <= 0) {
    return NextResponse.json(
      {
        error: "تجاوزت الحد الشهري لتوليد التعليقات",
        usage: currentUsage,
      },
      { status: 429 }
    );
  }

  const restaurant = await fetchRestaurantContext(restaurantId);
  const platform = body.platform ?? "instagram";

  const platformGuide =
    platform === "instagram"
      ? "Instagram: short hooks, 3-7 hashtags at the end, emojis allowed, max 2200 chars."
      : "Facebook: slightly longer (2-4 sentences), 0-2 hashtags, more conversational.";

  const prompt = `أنت كاتب إعلانات احترافي للعلامات التجارية على وسائل التواصل الاجتماعي باللغة العربية.

اكتب ٣ خيارات لتعليق منشور ${platform === "instagram" ? "Instagram" : "Facebook"} للنشاط التالي:
- اسم النشاط: ${restaurant.name}
${restaurant.description ? `- وصف النشاط: ${restaurant.description}` : ""}
${body.hint ? `- التركيز على: ${body.hint}` : ""}
${body.has_image ? "- المنشور يحتوي صورة" : ""}

${platformGuide}

أعد فقط JSON بهذا الشكل بدون أي شرح إضافي:
{"captions": ["...", "...", "..."]}`;

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
  } catch {
    return NextResponse.json({ error: "AI service unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Gemini error: ${text.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let captions: string[] = [];
  try {
    const parsed = JSON.parse(rawText) as { captions?: string[] };
    captions = Array.isArray(parsed.captions) ? parsed.captions.slice(0, 3) : [];
  } catch {
    // Gemini sometimes wraps in markdown — strip and retry
    const stripped = rawText.replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(stripped) as { captions?: string[] };
      captions = Array.isArray(parsed.captions) ? parsed.captions.slice(0, 3) : [];
    } catch {
      captions = [];
    }
  }

  if (!captions.length) {
    return NextResponse.json(
      { error: "Failed to parse AI response" },
      { status: 502 }
    );
  }

  const usage = await incrementAiUsage(restaurantId, "caption");

  return NextResponse.json({ captions, usage });
}
