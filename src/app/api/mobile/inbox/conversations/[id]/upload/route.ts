/**
 * POST /api/mobile/inbox/conversations/:id/upload
 *
 * Mobile equivalent of the dashboard's inbox upload route. Accepts a single
 * `file` field (multipart/form-data), persists it in the `whatsapp-media`
 * bucket under the tenant/conversation path convention, and returns
 * `{ storagePath, contentType, sizeBytes, originalFilename }` for the client
 * to pass to POST /api/mobile/inbox/conversations/:id/reply.
 *
 * Auth: caller must be an active team_member of the conversation's tenant AND
 * the conversation must currently be claimed by that team_member (mirrors the
 * send-reply route). Bot-delegated or unassigned conversations are rejected.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  uploadInboundMedia,
  MAX_INBOUND_MEDIA_BYTES,
} from "@/lib/storage-media";

export const runtime = "nodejs";

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

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { error: "Expected multipart/form-data body" },
        { status: 400 }
      );
    }
    const raw = form.get("file");
    if (!raw || typeof raw === "string") {
      return NextResponse.json(
        { error: "Missing 'file' field" },
        { status: 400 }
      );
    }
    const file = raw as File;
    if (file.size === 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty" },
        { status: 400 }
      );
    }
    if (file.size > MAX_INBOUND_MEDIA_BYTES) {
      return NextResponse.json(
        {
          error: `File too large (${file.size} > ${MAX_INBOUND_MEDIA_BYTES} bytes)`,
        },
        { status: 413 }
      );
    }

    const contentType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());

    const { storagePath, sizeBytes } = await uploadInboundMedia({
      restaurantId: conv.restaurant_id,
      conversationId: conv.id,
      contentType,
      buffer,
      originalFilename: file.name,
    });

    return NextResponse.json(
      {
        storagePath,
        contentType,
        sizeBytes,
        originalFilename: file.name || null,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
