/**
 * POST /api/mobile/inbox/conversations/:id/media/playable
 *
 * Body: { storagePath: string }
 *
 * Returns `{ url, contentType }` — a signed URL for a copy of the stored media
 * that the iOS player can handle. WhatsApp voice notes are Ogg/Opus, which
 * AVPlayer can't decode, so we transcode once to WAV and cache it next to the
 * original (`<path>.playable.wav`). Anything already playable is signed as is.
 *
 * Auth: active team_member of the conversation's tenant, and the storage path
 * must live under `<restaurantId>/<conversationId>/` of that conversation.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  WHATSAPP_MEDIA_BUCKET,
  MAX_INBOUND_MEDIA_BYTES,
  createMediaSignedUrl,
  parseMediaStoragePath,
} from "@/lib/storage-media";
import {
  isOggOpusContentType,
  oggOpusToWav,
  playableStoragePath,
} from "@/lib/audio-transcode";

export const runtime = "nodejs";
export const maxDuration = 60;

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      storagePath?: unknown;
    } | null;
    const storagePath =
      typeof body?.storagePath === "string" ? body.storagePath : "";
    if (!id || !storagePath || storagePath.includes("..")) {
      return NextResponse.json(
        { error: "id and storagePath required" },
        { status: 400 }
      );
    }

    const { data: conv } = await adminSupabaseClient
      .from("conversations")
      .select("id, restaurant_id")
      .eq("id", id)
      .maybeSingle();
    if (!conv) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const { data: member } = await adminSupabaseClient
      .from("team_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", conv.restaurant_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!member) {
      return NextResponse.json(
        { error: "Forbidden: not a member of this tenant" },
        { status: 403 }
      );
    }

    const owner = parseMediaStoragePath(storagePath);
    if (
      owner.restaurantId !== conv.restaurant_id ||
      owner.conversationId !== conv.id
    ) {
      return NextResponse.json(
        { error: "Forbidden: media does not belong to this conversation" },
        { status: 403 }
      );
    }

    const bucket = adminSupabaseClient.storage.from(WHATSAPP_MEDIA_BUCKET);
    const cachedPath = playableStoragePath(storagePath);

    // Cached copy first — signing fails when the object doesn't exist.
    const cached = await bucket.createSignedUrl(
      cachedPath,
      SIGNED_URL_TTL_SECONDS
    );
    if (cached.data?.signedUrl) {
      return NextResponse.json({
        url: cached.data.signedUrl,
        contentType: "audio/wav",
      });
    }

    const { data: blob, error: downloadError } =
      await bucket.download(storagePath);
    if (!blob || downloadError) {
      return NextResponse.json(
        { error: downloadError?.message ?? "Media not found" },
        { status: 404 }
      );
    }

    if (!isOggOpusContentType(blob.type) && !/\.(ogg|opus)$/i.test(storagePath)) {
      // Already in a format the device can play.
      return NextResponse.json({
        url: await createMediaSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS),
        contentType: blob.type || "application/octet-stream",
      });
    }
    if (blob.size > MAX_INBOUND_MEDIA_BYTES) {
      return NextResponse.json({ error: "Media too large" }, { status: 413 });
    }

    const wav = await oggOpusToWav(new Uint8Array(await blob.arrayBuffer()));
    const { error: uploadError } = await bucket.upload(cachedPath, wav, {
      contentType: "audio/wav",
      upsert: true,
      cacheControl: "3600",
    });
    if (uploadError) {
      return NextResponse.json(
        { error: `storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: await createMediaSignedUrl(cachedPath, SIGNED_URL_TTL_SECONDS),
      contentType: "audio/wav",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
