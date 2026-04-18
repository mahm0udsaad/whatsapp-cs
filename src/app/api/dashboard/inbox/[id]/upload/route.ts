/**
 * POST /api/dashboard/inbox/:id/upload
 *
 * Multipart form-data upload for the inbox composer's attachment feature.
 * Accepts a single `file` field, writes it to the `whatsapp-media` bucket
 * under the tenant/conversation path convention, and returns the
 * `{ storagePath, contentType, sizeBytes }` tuple the composer then passes
 * to POST /api/dashboard/inbox/:id/send.
 *
 * Auth mirrors the /send route: owner, super-admin, or the team member who
 * claims this order.
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
      return NextResponse.json({ error: "Order id required" }, { status: 400 });
    }

    const { data: order, error: orderErr } = await adminSupabaseClient
      .from("orders")
      .select("id, restaurant_id, conversation_id, assigned_to")
      .eq("id", id)
      .maybeSingle();
    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (!order.conversation_id) {
      return NextResponse.json(
        { error: "Order has no conversation" },
        { status: 400 }
      );
    }

    const { data: restaurant } = await adminSupabaseClient
      .from("restaurants")
      .select("id, owner_id")
      .eq("id", order.restaurant_id)
      .maybeSingle();
    if (!restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    const [{ data: member }, { data: profile }] = await Promise.all([
      adminSupabaseClient
        .from("team_members")
        .select("id, user_id, is_active, restaurant_id")
        .eq("user_id", user.id)
        .eq("restaurant_id", order.restaurant_id)
        .eq("is_active", true)
        .maybeSingle(),
      adminSupabaseClient
        .from("profiles")
        .select("id, is_super_admin")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const isOwner = restaurant.owner_id === user.id;
    const isSuperAdmin = profile?.is_super_admin === true;
    const isClaimer =
      member && order.assigned_to && order.assigned_to === member.id;

    if (!isOwner && !isSuperAdmin && !isClaimer) {
      return NextResponse.json(
        { error: "Forbidden: must own, super-admin, or claim this order" },
        { status: 403 }
      );
    }

    // Parse multipart form-data body.
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
      restaurantId: order.restaurant_id,
      conversationId: order.conversation_id,
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
