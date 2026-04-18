import { supabase } from "./supabase";

const BASE = process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";

/**
 * Fetch against the Next.js backend with the current Supabase access token
 * attached as a Bearer header. Backend routes use `createServerSupabaseClient`
 * with the cookie by default, but they also accept `Authorization: Bearer`
 * (Supabase SSR reads both in 2026 SDK) — this works for both web and native.
 */
const DEFAULT_TIMEOUT_MS = 15_000;

export async function apiFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const url = path.startsWith("http") ? path : `${BASE}${path}`;

  // fetch() on React Native has no default timeout — a flaky network or a
  // cold Vercel instance leaves the caller spinning forever. Abort after N ms
  // so UI spinners always resolve.
  const { timeoutMs, ...fetchInit } = init;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  let res: Response;
  try {
    res = await fetch(url, {
      ...fetchInit,
      headers,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if ((e as { name?: string })?.name === "AbortError") {
      throw new Error("انتهت مهلة الاتصال. حاولي مرة أخرى.");
    }
    throw e;
  }
  clearTimeout(timer);

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => "");
    }
    const err = new Error(
      `[${res.status}] ${
        (body as { error?: string })?.error ?? res.statusText
      }`
    ) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return res.json();
  return res.text();
}

export async function claimOrder(orderId: string) {
  return apiFetch(`/api/orders/${orderId}/claim`, { method: "POST" });
}

export async function sendReply(orderId: string, text: string) {
  return apiFetch(`/api/dashboard/inbox/${orderId}/send`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function getConversation(conversationId: string) {
  return apiFetch(`/api/mobile/conversations/${conversationId}`);
}

export async function setAvailability(isAvailable: boolean) {
  return apiFetch(`/api/mobile/availability`, {
    method: "PATCH",
    body: JSON.stringify({ isAvailable }),
  });
}

// ---- Claim-first conversation inbox ---------------------------------------

export type InboxFilter = "open" | "expired" | "mine" | "unassigned";

export interface InboxConversationRow {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  status: string;
  started_at: string;
  last_message_at: string;
  last_inbound_at: string | null;
  handler_mode: "unassigned" | "human" | "bot";
  assigned_to: string | null;
  assignee_name: string | null;
  preview: string | null;
  is_expired: boolean;
  is_mine: boolean;
}

export async function listInboxConversations(
  restaurantId: string,
  filter: InboxFilter,
  q = ""
): Promise<{ conversations: InboxConversationRow[]; teamMemberId: string | null }> {
  const params = new URLSearchParams({ restaurantId, filter });
  if (q.trim()) params.set("q", q.trim());
  return apiFetch(`/api/mobile/inbox/conversations?${params.toString()}`);
}

export async function getInboxConversation(conversationId: string) {
  return apiFetch(`/api/mobile/inbox/conversations/${conversationId}/messages`);
}

export async function claimConversation(
  conversationId: string,
  mode: "human" | "bot"
) {
  return apiFetch(`/api/mobile/inbox/claim`, {
    method: "POST",
    body: JSON.stringify({ conversationId, mode }),
  });
}

export async function replyToConversation(conversationId: string, text: string) {
  return apiFetch(`/api/mobile/inbox/conversations/${conversationId}/reply`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// ---- Manager surface ------------------------------------------------------

export interface AiStatus {
  enabled: boolean;
  restaurantId: string;
  activeBotConversations: number;
  lastChangedAt: string | null;
}

export async function getAiStatus(): Promise<AiStatus> {
  return apiFetch(`/api/mobile/ai/status`);
}

export async function toggleAi(
  enabled: boolean
): Promise<{ enabled: boolean; changed: boolean }> {
  return apiFetch(`/api/mobile/ai/toggle`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export interface OverviewSummary {
  unassignedCount: number;
  humanActiveCount: number;
  botActiveCount: number;
  expiredCount: number;
  ordersPendingCount: number;
  agentsOnShiftCount: number;
}

export async function getKpisToday(): Promise<OverviewSummary> {
  return apiFetch(`/api/mobile/kpis/today`);
}

export interface TeamMemberRosterRow {
  id: string;
  full_name: string | null;
  role: "admin" | "agent";
  is_active: boolean;
  is_available: boolean;
  on_shift_now: boolean;
  has_push_device: boolean;
  active_conversations: number;
  last_active_at: string | null;
}

export async function getTeamRoster(): Promise<TeamMemberRosterRow[]> {
  return apiFetch(`/api/mobile/team/roster`);
}

export async function forceOffline(teamMemberId: string) {
  return apiFetch(`/api/mobile/team/force-offline`, {
    method: "POST",
    body: JSON.stringify({ teamMemberId }),
  });
}

export interface WeeklyShiftRow {
  id: string;
  team_member_id: string;
  team_member_name: string | null;
  starts_at: string;
  ends_at: string;
  note: string | null;
}

export async function getWeeklyShifts(
  weekStart: string
): Promise<WeeklyShiftRow[]> {
  const params = new URLSearchParams({ weekStart });
  return apiFetch(`/api/mobile/team/shifts?${params.toString()}`);
}

export async function reassignConversation(input: {
  conversationId: string;
  assignToTeamMemberId?: string;
  forceBot?: boolean;
  unassign?: boolean;
}) {
  return apiFetch(`/api/mobile/inbox/reassign`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface PendingApproval {
  id: string;
  conversation_id: string;
  customer_name: string | null;
  customer_phone: string;
  type: string;
  status: string;
  created_at: string;
  summary: string | null;
}

export async function getApprovals(): Promise<PendingApproval[]> {
  return apiFetch(`/api/mobile/approvals`);
}

export async function respondToOrder(
  orderId: string,
  action: "confirm" | "reject" | "reply",
  options: { adminNote?: string; adminReply?: string } = {}
) {
  return apiFetch(`/api/mobile/orders/${orderId}/respond`, {
    method: "POST",
    body: JSON.stringify({ action, ...options }),
  });
}
