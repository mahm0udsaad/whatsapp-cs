/**
 * GET /api/mobile/inbox/conversations
 *
 * Mobile-facing list. Same filter semantics as the dashboard variant.
 *   filter=open       → last_inbound_at within the last 24h (WhatsApp session live)
 *   filter=expired    → last_inbound_at older than 24h
 *   filter=mine       → assigned_to = caller's team_member
 *   filter=unassigned → handler_mode = 'unassigned'
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const FILTERS = new Set(["open", "expired", "mine", "unassigned", "all"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const restaurantId = (url.searchParams.get("restaurantId") || "").trim();
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
    }
    const filter = (url.searchParams.get("filter") || "open").toLowerCase();
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || DEFAULT_LIMIT), 200);

    if (!FILTERS.has(filter)) {
      return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
    }

    const { data: member } = await adminSupabaseClient
      .from("team_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!member) {
      return NextResponse.json(
        { error: "Forbidden: not a member of this tenant" },
        { status: 403 }
      );
    }
    const teamMemberId = member.id as string;

    const cutoff = new Date(Date.now() - DAY_MS).toISOString();

    let query = adminSupabaseClient
      .from("conversations")
      .select(
        "id, customer_name, customer_phone, status, started_at, last_message_at, last_inbound_at, handler_mode, assigned_to"
      )
      .eq("restaurant_id", restaurantId)
      .order("last_message_at", { ascending: false })
      .limit(limit);

    if (filter === "open") query = query.gte("last_inbound_at", cutoff);
    else if (filter === "expired") query = query.lt("last_inbound_at", cutoff);
    else if (filter === "mine") query = query.eq("assigned_to", teamMemberId);
    else if (filter === "unassigned") query = query.eq("handler_mode", "unassigned");

    if (q) {
      const like = `%${q.replace(/%/g, "\\%")}%`;
      query = query.or(`customer_name.ilike.${like},customer_phone.ilike.${like}`);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const conversations = rows ?? [];
    const assigneeIds = Array.from(
      new Set(conversations.map((c) => c.assigned_to).filter(Boolean) as string[])
    );
    let assigneeMap = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const { data: members } = await adminSupabaseClient
        .from("team_members")
        .select("id, full_name")
        .in("id", assigneeIds);
      assigneeMap = new Map((members ?? []).map((m) => [m.id as string, (m.full_name as string) || ""]));
    }

    const convIds = conversations.map((c) => c.id);
    const previewMap = new Map<string, string>();
    if (convIds.length > 0) {
      const { data: recent } = await adminSupabaseClient
        .from("messages")
        .select("conversation_id, content, created_at, role")
        .in("conversation_id", convIds)
        .eq("role", "customer")
        .order("created_at", { ascending: false })
        .limit(convIds.length * 3);
      for (const m of recent ?? []) {
        const cid = m.conversation_id as string;
        if (!previewMap.has(cid)) previewMap.set(cid, (m.content as string) || "");
      }
    }

    const shaped = conversations.map((c) => ({
      ...c,
      assignee_name: c.assigned_to ? assigneeMap.get(c.assigned_to as string) ?? null : null,
      preview: previewMap.get(c.id as string) ?? null,
      is_expired:
        !!c.last_inbound_at &&
        new Date(c.last_inbound_at as string).getTime() < Date.now() - DAY_MS,
      is_mine: c.assigned_to === teamMemberId,
    }));

    return NextResponse.json({ conversations: shaped, teamMemberId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
