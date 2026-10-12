/**
 * POST /api/mobile/inbox/conversations/:id/upload-url
 *
 * Returns a short-lived Supabase signed upload URL so the phone can stream an
 * attachment straight into the `whatsapp-media` bucket. The sibling `upload`
 * route takes the file as multipart through this backend, which the serverless
 * request-body cap limits to a few MB — too small for videos. Here the bytes
 * never touch the backend; the client passes the returned `storagePath` to
 * POST /api/mobile/inbox/conversations/:id/reply.
 *
 * Auth: same as the upload and reply routes — caller must be an active
 * team_member of the conversation's tenant AND currently hold the claim.
 *
 * Body:    { contentType: string, sizeBytes?: number }
 * Returns: { storagePath, signedUrl, token, contentType }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  buildMediaStoragePath,
  createMediaSignedUploadUrl,
  MAX_OUTBOUND_MEDIA_BYTES,
} from "@/lib/storage-media";

interface UploadUrlBody {
  contentType?: string;
  sizeBytes?: number;
}

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
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as UploadUrlBody;
    const contentType = (body.contentType || "").trim();
    if (!contentType) {
      return NextResponse.json(
        { error: "contentType is required" },
        { status: 400 }
      );
    }
    if (
      typeof body.sizeBytes === "number" &&
      body.sizeBytes > MAX_OUTBOUND_MEDIA_BYTES
    ) {
      return NextResponse.json(
        {
          error: `File too large (${body.sizeBytes} > ${MAX_OUTBOUND_MEDIA_BYTES} bytes)`,
        },
        { status: 413 }
      );
    }

    const { data: conv } = await adminSupabaseClient
      .from("conversations")
      .select("id, restaurant_id, handler_mode, assigned_to")
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

    if (conv.handler_mode !== "human") {
      return NextResponse.json(
        {
          error:
            conv.handler_mode === "bot"
              ? "Conversation is delegated to the bot"
              : "Conversation is not claimed",
        },
        { status: 409 }
      );
    }
    if (conv.assigned_to !== member.id) {
      return NextResponse.json(
        { error: "Conversation is claimed by another agent" },
        { status: 409 }
      );
    }

    // Server picks the path, so the object always lands under this tenant's
    // prefix — the reply route re-checks that prefix before sending.
    const storagePath = buildMediaStoragePath({
      restaurantId: conv.restaurant_id,
      conversationId: conv.id,
      contentType,
    });
    const { signedUrl, token } = await createMediaSignedUploadUrl(storagePath);

    return NextResponse.json({ storagePath, signedUrl, token, contentType });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
