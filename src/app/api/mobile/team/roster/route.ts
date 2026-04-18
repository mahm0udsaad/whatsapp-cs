/**
 * GET /api/mobile/team/roster
 *
 * Manager-only. Returns every active team member of the caller's tenant with
 * live availability context: on-shift state, presence of a push device, count
 * of active assigned conversations, last active timestamp.
 *
 * Shape:
 *   Array<{
 *     id: string;
 *     full_name: string | null;
 *     role: 'admin' | 'agent';
 *     is_active: boolean;
 *     is_available: boolean;
 *     on_shift_now: boolean;
 *     has_push_device: boolean;
 *     active_conversations: number;
 *     last_active_at: string | null;
 *   }>
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  // 1. All team members for this restaurant.
  const { data: members, error: membersErr } = await adminSupabaseClient
    .from("team_members")
    .select("id, full_name, role, is_active, is_available")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("role", { ascending: true })
    .order("full_name", { ascending: true });
  if (membersErr) {
    return NextResponse.json({ error: membersErr.message }, { status: 500 });
  }
  if (!members || members.length === 0) {
    return NextResponse.json([]);
  }

  const memberIds = members.map((m) => m.id);
  const nowIso = new Date().toISOString();

  // 2. Shifts currently overlapping now.
  const { data: shifts } = await adminSupabaseClient
    .from("agent_shifts")
    .select("team_member_id")
    .in("team_member_id", memberIds)
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso);
  const onShift = new Set((shifts ?? []).map((s) => s.team_member_id));

  // 3. Push devices (non-disabled).
  const { data: tokens } = await adminSupabaseClient
    .from("user_push_tokens")
    .select("team_member_id")
    .in("team_member_id", memberIds)
    .eq("disabled", false);
  const withDevice = new Set((tokens ?? []).map((t) => t.team_member_id));

  // 4. Active conversations per member.
  const { data: convs } = await adminSupabaseClient
    .from("conversations")
    .select("assigned_to")
    .eq("restaurant_id", restaurantId)
    .eq("status", "active")
    .not("assigned_to", "is", null);
  const activeCounts = new Map<string, number>();
  for (const row of convs ?? []) {
    const id = row.assigned_to as string | null;
    if (id) activeCounts.set(id, (activeCounts.get(id) ?? 0) + 1);
  }

  // 5. Last-active (latest claim event).
  const { data: events } = await adminSupabaseClient
    .from("conversation_claim_events")
    .select("team_member_id, claimed_at")
    .in("team_member_id", memberIds)
    .order("claimed_at", { ascending: false });
  const lastActive = new Map<string, string>();
  for (const ev of events ?? []) {
    if (!lastActive.has(ev.team_member_id)) {
      lastActive.set(ev.team_member_id, ev.claimed_at);
    }
  }

  const rows = members.map((m) => ({
    id: m.id,
    full_name: m.full_name,
    role: m.role,
    is_active: m.is_active,
    is_available: m.is_available,
    on_shift_now: onShift.has(m.id),
    has_push_device: withDevice.has(m.id),
    active_conversations: activeCounts.get(m.id) ?? 0,
    last_active_at: lastActive.get(m.id) ?? null,
  }));

  return NextResponse.json(rows);
}
