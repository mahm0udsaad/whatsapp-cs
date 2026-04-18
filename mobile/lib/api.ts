import { supabase } from "./supabase";

const BASE = process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";

/**
 * Fetch against the Next.js backend with the current Supabase access token
 * attached as a Bearer header. Backend routes use `createServerSupabaseClient`
 * with the cookie by default, but they also accept `Authorization: Bearer`
 * (Supabase SSR reads both in 2026 SDK) — this works for both web and native.
 */
// Default timeout for GET reads. Generous enough to absorb a Vercel
// cold-start on the hobby tier (up to ~25s in practice).
const DEFAULT_TIMEOUT_MS = 30_000;
// Mutations (claim, reassign, reply) block the UI with a spinner. Bias toward
// a longer fuse so the first call after an idle period doesn't spuriously
// fail on cold-start. Most mutations return in <2s once warm.
const DEFAULT_MUTATION_TIMEOUT_MS = 45_000;

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
  // so UI spinners always resolve. Mutations get a longer default than reads.
  const { timeoutMs, ...fetchInit } = init;
  const isMutation =
    typeof fetchInit.method === "string" &&
    fetchInit.method.toUpperCase() !== "GET";
  const effectiveTimeout =
    timeoutMs ??
    (isMutation ? DEFAULT_MUTATION_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);

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
      const elapsed = Date.now() - startedAt;
      console.warn(
        `[api] ${fetchInit.method ?? "GET"} ${path} aborted after ${elapsed}ms (limit ${effectiveTimeout}ms)`
      );
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

  // Every mobile endpoint returns JSON. If we get anything else back (HTML,
  // plain text), that's always a deployment/middleware issue — a login-page
  // redirect, a 404 page with a 200 status from an edge proxy, or similar.
  // Returning the raw string to callers was how `foo.filter is not a function`
  // crashes leaked into screens that assumed arrays. Throw a clear error here
  // instead, so callers land in React Query's error state and the developer
  // sees exactly what happened.
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!text) return null;
  if (contentType.includes("application/json") || /^\s*[\[{]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch (parseError) {
      const err = new Error(
        `Failed to parse JSON response from ${path}: ${
          parseError instanceof Error ? parseError.message : "unknown"
        }`
      ) as Error & { status?: number; body?: unknown };
      err.status = res.status;
      err.body = text.slice(0, 200);
      throw err;
    }
  }
  // Non-JSON response with a 2xx status — treat as a server-side error
  // (usually an auth redirect that followed through to an HTML page).
  const err = new Error(
    `Non-JSON response from ${path} (status ${res.status}). ` +
      `First 80 chars: ${text.slice(0, 80)}`
  ) as Error & { status?: number; body?: unknown };
  err.status = res.status;
  err.body = text.slice(0, 200);
  throw err;
}

/**
 * Defensive array coercion for React Query results. If the backend ever
 * returns a non-array shape (should now be impossible thanks to the apiFetch
 * hardening above, but future-proofing against proxy misbehavior), return an
 * empty array instead of crashing `.filter`/`.map` on a string.
 */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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

export interface ReplyAttachment {
  storagePath: string;
  contentType: string;
  sizeBytes?: number;
  originalFilename?: string;
}

export async function replyToConversation(
  conversationId: string,
  text: string,
  attachment?: ReplyAttachment
) {
  return apiFetch(`/api/mobile/inbox/conversations/${conversationId}/reply`, {
    method: "POST",
    body: JSON.stringify({ text, attachment }),
  });
}

/**
 * Upload a file to the conversation via multipart/form-data. Returns the
 * storage metadata to pass to replyToConversation().
 */
export async function uploadConversationMedia(
  conversationId: string,
  file: {
    uri: string;
    name: string;
    type: string;
  }
): Promise<ReplyAttachment> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } blobs directly.
  form.append(
    "file",
    {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as unknown as Blob
  );

  const url = `${BASE}/api/mobile/inbox/conversations/${conversationId}/upload`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_MUTATION_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      body: form,
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => "");
    }
    throw new Error(
      `[${res.status}] ${(body as { error?: string })?.error ?? res.statusText}`
    );
  }
  return (await res.json()) as ReplyAttachment;
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
