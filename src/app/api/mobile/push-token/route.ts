/**
 * POST /api/mobile/push-token
 *
 * Responsibilities:
 *   - Register / refresh an Expo push token for the calling team member in
 *     the context of a specific restaurant tenant.
 *   - Ensure the (team_member_id, device_id) uniqueness holds: one device
 *     owns at most one row per member.
 *   - Ensure the raw expo_token isn't active under two different team_members
 *     simultaneously (active means `disabled = false`) — any other row using
 *     the same token under a different member is soft-disabled.
 *
 * Auth: Supabase cookie session (createServerSupabaseClient).
 *   Caller must be authenticated AND have an active team_members row in the
 *   given restaurantId, else 403.
 *
 * Body:
 *   {
 *     expoToken: string,     // required — Expo push token
 *     deviceId?: string,     // optional — device uniqueness key
 *     platform?: 'ios' | 'android' | 'web',
 *     restaurantId: string,  // required
 *   }
 *
 * Response: { id, lastSeenAt }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

interface RegisterBody {
  expoToken?: string;
  deviceId?: string;
  platform?: "ios" | "android" | "web";
  restaurantId?: string;
}

const ALLOWED_PLATFORMS = new Set(["ios", "android", "web"]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: RegisterBody;
    try {
      body = (await request.json()) as RegisterBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const expoToken = body.expoToken?.trim();
    const restaurantId = body.restaurantId?.trim();
    const deviceId = body.deviceId?.trim() || null;
    const platform = body.platform;

    if (!expoToken) {
      return NextResponse.json(
        { error: "expoToken required" },
        { status: 400 }
      );
    }
    if (!restaurantId) {
      return NextResponse.json(
        { error: "restaurantId required" },
        { status: 400 }
      );
    }
    if (platform && !ALLOWED_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    // Verify caller is an active member of that tenant.
    const { data: member, error: memberErr } = await adminSupabaseClient
      .from("team_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .maybeSingle();
    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }
    if (!member) {
      return NextResponse.json(
        { error: "Forbidden: not a member of this tenant" },
        { status: 403 }
      );
    }

    const teamMemberId = member.id as string;
    const nowIso = new Date().toISOString();

    // Step A: soft-disable any OTHER rows using the same expo_token (other
    // member or other device) to preserve the "unique active token" invariant.
    {
      const query = adminSupabaseClient
        .from("user_push_tokens")
        .update({ disabled: true })
        .eq("expo_token", expoToken)
        .neq("team_member_id", teamMemberId);
      const { error: disableOthersErr } = await query;
      if (disableOthersErr) {
        console.error(
          "[mobile/push-token] failed to disable duplicate tokens:",
          disableOthersErr.message
        );
      }
    }

    // Step B: upsert on (team_member_id, device_id). If deviceId is null we
    // can't use the conditional unique index, so we fall back to find-or-create
    // by (team_member_id, expo_token).
    let existingId: string | null = null;
    {
      const base = adminSupabaseClient
        .from("user_push_tokens")
        .select("id")
        .eq("team_member_id", teamMemberId)
        .limit(1);
      const { data: existing } = deviceId
        ? await base.eq("device_id", deviceId).maybeSingle()
        : await base.eq("expo_token", expoToken).maybeSingle();
      if (existing?.id) existingId = existing.id as string;
    }

    let finalId: string;
    if (existingId) {
      const { data: updated, error: updateErr } = await adminSupabaseClient
        .from("user_push_tokens")
        .update({
          expo_token: expoToken,
          platform: platform ?? null,
          device_id: deviceId,
          restaurant_id: restaurantId,
          last_seen_at: nowIso,
          disabled: false,
        })
        .eq("id", existingId)
        .select("id, last_seen_at")
        .single();
      if (updateErr || !updated) {
        return NextResponse.json(
          { error: updateErr?.message ?? "Failed to update push token" },
          { status: 500 }
        );
      }
      finalId = updated.id as string;
    } else {
      const { data: inserted, error: insertErr } = await adminSupabaseClient
        .from("user_push_tokens")
        .insert({
          team_member_id: teamMemberId,
          restaurant_id: restaurantId,
          expo_token: expoToken,
          device_id: deviceId,
          platform: platform ?? null,
          last_seen_at: nowIso,
          disabled: false,
        })
        .select("id, last_seen_at")
        .single();
      if (insertErr || !inserted) {
        return NextResponse.json(
          { error: insertErr?.message ?? "Failed to insert push token" },
          { status: 500 }
        );
      }
      finalId = inserted.id as string;
    }

    return NextResponse.json(
      { id: finalId, lastSeenAt: nowIso },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
