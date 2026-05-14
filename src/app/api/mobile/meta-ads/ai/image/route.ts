/**
 * POST /api/mobile/meta-ads/ai/image
 *
 * Generates a post image with Gemini's image-preview model. Supports:
 *   - Text-to-image: prompt only
 *   - Image+text: reference image + prompt (for editing/transforming)
 *
 * Body:
 *   prompt:                  string  (required)
 *   reference_image_base64?: string  (optional)
 *   reference_image_type?:   string  (default "image/jpeg")
 *
 * Returns:
 *   image_url:    string  (signed Supabase storage URL)
 *   image_base64: string  (for immediate preview without re-fetch)
 *   usage:        { used, limit, remaining, month }
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { incrementAiUsage, getAiUsage } from "@/lib/ai-usage";

// Try the explicitly-requested model first; fall back to the stable nano banana
// if the preview endpoint returns 404. Both share the same request/response shape.
const PRIMARY_MODEL = "gemini-3-pro-image-preview";
const FALLBACK_MODEL = "gemini-2.5-flash-image-preview";

const STORAGE_BUCKET = "whatsapp-media";

interface ImageBody {
  prompt?: string;
  reference_image_base64?: string;
  reference_image_type?: string;
}

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  error?: { message: string };
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  refImage?: { base64: string; mimeType: string }
): Promise<{ ok: boolean; data: GeminiResponse; status: number }> {
  const parts: unknown[] = [{ text: prompt }];
  if (refImage) {
    parts.push({
      inline_data: { mime_type: refImage.mimeType, data: refImage.base64 },
    });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    }
  );

  const data = (await res.json()) as GeminiResponse;
  return { ok: res.ok, data, status: res.status };
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  let body: ImageBody;
  try {
    body = (await request.json()) as ImageBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  // Soft limit check BEFORE the expensive call
  const currentUsage = await getAiUsage(restaurantId, "image");
  if (currentUsage.remaining <= 0) {
    return NextResponse.json(
      {
        error: `تجاوزت الحد الشهري لتوليد الصور (${currentUsage.limit} صورة في الشهر)`,
        usage: currentUsage,
      },
      { status: 429 }
    );
  }

  const refImage = body.reference_image_base64
    ? {
        base64: body.reference_image_base64,
        mimeType: body.reference_image_type ?? "image/jpeg",
      }
    : undefined;

  // Try primary model, fall back if it doesn't exist yet
  let result = await callGemini(apiKey, PRIMARY_MODEL, body.prompt, refImage);
  if (!result.ok && result.status === 404) {
    result = await callGemini(apiKey, FALLBACK_MODEL, body.prompt, refImage);
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: `Gemini error: ${result.data.error?.message ?? "unknown"}` },
      { status: 502 }
    );
  }

  // Extract image from response
  const parts = result.data.candidates?.[0]?.content?.parts ?? [];
  let imageBase64: string | null = null;
  let imageMime = "image/png";
  for (const p of parts) {
    const inline = p.inline_data ?? p.inlineData;
    if (inline?.data) {
      imageBase64 = inline.data;
      imageMime =
        (p.inline_data?.mime_type ?? p.inlineData?.mimeType) ?? "image/png";
      break;
    }
  }

  if (!imageBase64) {
    return NextResponse.json(
      { error: "AI did not return an image" },
      { status: 502 }
    );
  }

  // Upload to storage so it can be used in posts later (signed URL)
  const buffer = Buffer.from(imageBase64, "base64");
  const ext = imageMime.split("/")[1] ?? "png";
  const path = `ai-generated/${restaurantId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await adminSupabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: imageMime, upsert: false });

  let imageUrl: string | null = null;
  if (!uploadErr) {
    const { data: signed } = await adminSupabaseClient.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 7200);
    imageUrl = signed?.signedUrl ?? null;
  }

  // Only increment usage on success
  const usage = await incrementAiUsage(restaurantId, "image");

  return NextResponse.json({
    image_base64: imageBase64,
    image_type: imageMime,
    image_url: imageUrl,
    usage,
  });
}
