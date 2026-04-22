/**
 * POST /api/mobile/marketing/templates/image
 *
 * Two modes, selected by `mode` in the body:
 *
 *   { mode: "upload", base64, content_type }
 *     Upload a user-supplied image (already picked via expo-image-picker and
 *     base64-encoded on device) into the whatsapp-media bucket under
 *     <restaurantId>/templates/<ulid>.<ext> and return a long-lived signed URL
 *     Twilio/Meta can fetch during approval and send.
 *
 *   { mode: "generate", prompt }
 *     Generate a marketing image via Gemini image model, upload it under the
 *     same convention, return the same { url, storage_path } shape.
 *
 * Manager-only (campaign authoring).
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import {
  WHATSAPP_MEDIA_BUCKET,
  extFromContentType,
  createMediaSignedUrl,
} from "@/lib/storage-media";
import { generateMarketingImage } from "@/lib/gemini-image";

// Roughly 1 year — covers Meta approval + the lifetime of most campaigns.
// Signed URLs beyond this should be regenerated from storage_path.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // WhatsApp hard cap is 5 MB for images.

function buildTemplateImagePath(restaurantId: string, contentType: string) {
  const id = `${Date.now().toString(36)}${randomUUID().replace(/-/g, "").slice(0, 18)}`;
  const ext = extFromContentType(contentType);
  return `${restaurantId}/templates/${id}.${ext}`;
}

async function uploadBufferAndSign(
  restaurantId: string,
  buffer: Buffer,
  contentType: string
) {
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large: ${buffer.byteLength} bytes (max 5 MB)`);
  }
  const storagePath = buildTemplateImagePath(restaurantId, contentType);
  const { error } = await adminSupabaseClient.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
      cacheControl: "31536000",
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const url = await createMediaSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  return { storage_path: storagePath, url };
}

interface Body {
  mode?: "upload" | "generate";
  base64?: string;
  content_type?: string;
  prompt?: string;
  language?: "ar" | "en";
  aspect_ratio?: "1:1" | "16:9" | "4:3";
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.mode === "upload") {
      if (!body.base64 || !body.content_type) {
        return NextResponse.json(
          { error: "base64 and content_type required for upload mode" },
          { status: 400 }
        );
      }
      const ct = body.content_type.split(";")[0].trim().toLowerCase();
      if (!ct.startsWith("image/")) {
        return NextResponse.json(
          { error: "content_type must be image/*" },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(body.base64, "base64");
      const out = await uploadBufferAndSign(restaurantId, buffer, ct);
      return NextResponse.json(out, { status: 201 });
    }

    if (body.mode === "generate") {
      const prompt = body.prompt?.trim();
      if (!prompt) {
        return NextResponse.json(
          { error: "prompt required for generate mode" },
          { status: 400 }
        );
      }

      const { data: restaurant } = await adminSupabaseClient
        .from("restaurants")
        .select("name")
        .eq("id", restaurantId)
        .maybeSingle();

      const gen = await generateMarketingImage({
        prompt,
        restaurantName: restaurant?.name || "Restaurant",
        language: body.language || "ar",
        aspectRatio: body.aspect_ratio || "16:9",
      });
      const buffer = Buffer.from(gen.imageBase64, "base64");
      const out = await uploadBufferAndSign(restaurantId, buffer, gen.mimeType);
      return NextResponse.json(
        { ...out, description: gen.description },
        { status: 201 }
      );
    }

    return NextResponse.json(
      { error: 'mode must be "upload" or "generate"' },
      { status: 400 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
