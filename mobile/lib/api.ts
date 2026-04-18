import { supabase } from "./supabase";

const BASE = process.env.EXPO_PUBLIC_APP_BASE_URL ?? "";

/**
 * Fetch against the Next.js backend with the current Supabase access token
 * attached as a Bearer header. Backend routes use `createServerSupabaseClient`
 * with the cookie by default, but they also accept `Authorization: Bearer`
 * (Supabase SSR reads both in 2026 SDK) — this works for both web and native.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, { ...init, headers });

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
