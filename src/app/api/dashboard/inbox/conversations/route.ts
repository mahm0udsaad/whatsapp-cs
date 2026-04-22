/**
 * GET /api/dashboard/inbox/conversations
 *
 * Unified conversations inbox. Supports filters:
 *   filter=open       → last_inbound_at within the last 24h
 *   filter=expired    → last_inbound_at older than 24h (WhatsApp window closed)
 *   filter=mine       → assigned_to == caller's team_member_id
 *   filter=unassigned → handler_mode = 'unassigned'
 *   q=...             → optional substring match on customer_name / customer_phone
 *
 * Auth: Supabase cookie session. Caller is scoped to a restaurant via their
 *       active team_members row (or restaurant ownership).
 *
 * Response:
 *   {
 *     conversations: [
 *       {
 *         id, customer_name, customer_phone, last_message_at, last_inbound_at,
 *         handler_mode, assigned_to, assignee_name, unread_count, preview
 *       }
 *     ]
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const FILTERS = new Set(["open", "expired", "mine", "unassigned", "all"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 50;

async function resolveScope(userId: string): Promise<
  | { restaurantId: string; teamMemberId: string | null }
  | { error: string; status: number }
> {
  // Prefer active team_members row.
  const { data: member } = await adminSupabaseClient
    .from("team_members")
    .select("id, restaurant_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (member?.restaurant_id) {
    return { restaurantId: member.restaurant_id as string, teamMemberId: member.id as string };
  }
  // Fallback: owner.
  const { data: owned } = await adminSupabaseClient
    .from("restaurants")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  if (owned?.id) {
    return { restaurantId: owned.id as string, teamMemberId: null };
  }
  return { error: "No accessible restaurant", status: 403 };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = await resolveScope(user.id);
    if ("error" in scope) {
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }

    const url = new URL(request.url);
    const filter = (url.searchParams.get("filter") || "open").toLowerCase();
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || DEFAULT_LIMIT), 200);

    if (!FILTERS.has(filter)) {
      return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
    }

    const cutoff = new Date(Date.now() - DAY_MS).toISOString();

    let query = adminSupabaseClient
      .from("conversations")
      .select(
        "id, customer_name, customer_phone, status, started_at, last_message_at, last_inbound_at, handler_mode, assigned_to"
      )
      .eq("restaurant_id", scope.restaurantId)
      .order("last_message_at", { ascending: false })
      .limit(limit);

    if (filter === "open") {
      query = query.gte("last_inbound_at", cutoff);
    } else if (filter === "expired") {
      query = query.lt("last_inbound_at", cutoff);
    } else if (filter === "mine") {
      if (!scope.teamMemberId) {
        return NextResponse.json({ conversations: [] });
      }
      query = query.eq("assigned_to", scope.teamMemberId);
    } else if (filter === "unassigned") {
      query = query.eq("handler_mode", "unassigned");
    }

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

    // Latest message preview per conversation (any role).
    const convIds = conversations.map((c) => c.id);
    let previewMap = new Map<
      string,
      { content: string; created_at: string; role: "customer" | "agent" | "system" }
    >();
    if (convIds.length > 0) {
      const { data: recent } = await adminSupabaseClient
        .from("messages")
        .select("conversation_id, content, created_at, role")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(convIds.length * 3);
      for (const m of recent ?? []) {
        const cid = m.conversation_id as string;
        if (!previewMap.has(cid)) {
          previewMap.set(cid, {
            content: (m.content as string) || "",
            created_at: m.created_at as string,
            role: m.role as "customer" | "agent" | "system",
          });
        }
      }
    }

    const shaped = conversations.map((c) => {
      const p = previewMap.get(c.id as string);
      return {
        ...c,
        assignee_name: c.assigned_to ? assigneeMap.get(c.assigned_to as string) ?? null : null,
        preview: p?.content ?? null,
        preview_role: p?.role ?? null,
        is_expired:
          !!c.last_inbound_at &&
          new Date(c.last_inbound_at as string).getTime() < Date.now() - DAY_MS,
      };
    });

    return NextResponse.json({ conversations: shaped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
