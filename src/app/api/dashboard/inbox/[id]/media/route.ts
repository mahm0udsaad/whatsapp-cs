/**
 * GET /api/dashboard/inbox/:id/media?path=<storagePath>
 *
 * Returns a short-lived (1h) signed URL for a stored media object in the
 * `whatsapp-media` bucket. Validates that:
 *   1. The caller can access this order (owner / super-admin / claimer), and
 *   2. The requested storagePath starts with this order's restaurant id
 *      (i.e. the agent can't resolve another tenant's blobs by guessing a
 *      path).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  createMediaSignedUrl,
  parseMediaStoragePath,
} from "@/lib/storage-media";

const SIGNED_URL_TTL_SECONDS = 3600;

export async function GET(
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

    const storagePath = request.nextUrl.searchParams.get("path") || "";
    if (!storagePath) {
      return NextResponse.json(
        { error: "Missing 'path' query param" },
        { status: 400 }
      );
    }

    const { data: order } = await adminSupabaseClient
      .from("orders")
      .select("id, restaurant_id, conversation_id, assigned_to")
      .eq("id", id)
      .maybeSingle();
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
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
    const isMember = !!member;

    if (!isOwner && !isSuperAdmin && !isMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { restaurantId: pathRestaurantId } =
      parseMediaStoragePath(storagePath);
    if (!pathRestaurantId || pathRestaurantId !== order.restaurant_id) {
      return NextResponse.json(
        { error: "Tenant mismatch for storage path" },
        { status: 403 }
      );
    }

    const url = await createMediaSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    const expiresAt = new Date(
      Date.now() + SIGNED_URL_TTL_SECONDS * 1000
    ).toISOString();

    return NextResponse.json({ url, expiresAt }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
