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
  // Short 15s timeout on this mutation so a silent hang surfaces as an error
  // in the UI instead of leaving the spinner stuck forever. The claim RPC
  // itself is fast; anything longer means the request didn't reach Vercel.
  return apiFetch(`/api/mobile/inbox/claim`, {
    method: "POST",
    body: JSON.stringify({ conversationId, mode }),
    timeoutMs: 15_000,
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

// ---- Labels & archive ------------------------------------------------------

export type LabelColor =
  | "slate"
  | "red"
  | "amber"
  | "emerald"
  | "blue"
  | "indigo"
  | "fuchsia"
  | "rose";

export interface ConversationLabel {
  id: string;
  restaurant_id: string;
  name: string;
  color: LabelColor;
  created_at: string;
}

export async function listLabels(): Promise<ConversationLabel[]> {
  return apiFetch(`/api/mobile/labels`);
}

export async function createLabel(input: {
  restaurantId: string;
  name: string;
  color?: LabelColor;
}): Promise<ConversationLabel> {
  return apiFetch(`/api/mobile/labels`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setConversationLabels(
  conversationId: string,
  labelIds: string[]
): Promise<{ labelIds: string[] }> {
  return apiFetch(
    `/api/mobile/inbox/conversations/${conversationId}/labels`,
    {
      method: "PUT",
      body: JSON.stringify({ labelIds }),
    }
  );
}

export async function setConversationArchived(
  conversationId: string,
  archived: boolean
): Promise<{ id: string; archived_at: string | null }> {
  return apiFetch(
    `/api/mobile/inbox/conversations/${conversationId}/archive`,
    {
      method: "POST",
      body: JSON.stringify({ archived }),
    }
  );
}

// ---- Team performance ------------------------------------------------------

export interface TeamPerformanceRow {
  team_member_id: string;
  full_name: string | null;
  role: "admin" | "agent";
  is_active: boolean;
  is_available: boolean;
  messages_sent: number;
  conversations_handled: number;
  active_now: number;
  first_response_p50_sec: number;
  first_response_p90_sec: number;
  reply_latency_p50_sec: number;
  takeovers_from_bot: number;
  reassigns_received: number;
  reassigns_given: number;
  sla_breaches: number;
  labels_applied: number;
  approx_hours_worked: number;
}

export interface TeamPerformanceResponse {
  from: string;
  to: string;
  rows: TeamPerformanceRow[];
}

export interface AgentPerformanceDaily {
  day: string; // YYYY-MM-DD
  messages: number;
  conversations: number;
  p50_reply_sec: number;
}

export interface AgentPerformanceHeatCell {
  weekday: number; // 0=Sun .. 6=Sat
  hour: number; // 0..23
  messages: number;
}

export interface AgentPerformanceDetail {
  from: string;
  to: string;
  daily: AgentPerformanceDaily[];
  heatmap: AgentPerformanceHeatCell[];
}

function buildRangeQuery(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const q = params.toString();
  return q ? `?${q}` : "";
}

export async function getTeamPerformance(
  from?: string,
  to?: string
): Promise<TeamPerformanceResponse> {
  return apiFetch(`/api/mobile/team/performance${buildRangeQuery(from, to)}`);
}

export async function getAgentPerformanceDetail(
  teamMemberId: string,
  from?: string,
  to?: string
): Promise<AgentPerformanceDetail> {
  return apiFetch(
    `/api/mobile/team/performance/${teamMemberId}${buildRangeQuery(from, to)}`
  );
}

// ---- Manager notes + goals -------------------------------------------------

export interface TeamMemberNote {
  id: string;
  body: string;
  author_user_id: string | null;
  created_at: string;
}

export interface TeamMemberGoals {
  team_member_id: string;
  target_first_response_sec: number | null;
  target_messages_per_day: number | null;
  updated_at: string;
}

export async function listTeamMemberNotes(
  teamMemberId: string
): Promise<TeamMemberNote[]> {
  return apiFetch(`/api/mobile/team/members/${teamMemberId}/notes`);
}

export async function addTeamMemberNote(
  teamMemberId: string,
  body: string
): Promise<TeamMemberNote> {
  return apiFetch(`/api/mobile/team/members/${teamMemberId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function deleteTeamMemberNote(
  teamMemberId: string,
  noteId: string
): Promise<{ ok: true }> {
  return apiFetch(
    `/api/mobile/team/members/${teamMemberId}/notes/${noteId}`,
    { method: "DELETE" }
  );
}

export async function getTeamMemberGoals(
  teamMemberId: string
): Promise<TeamMemberGoals | null> {
  return apiFetch(`/api/mobile/team/members/${teamMemberId}/goals`);
}

export async function setTeamMemberGoals(
  teamMemberId: string,
  input: {
    target_first_response_sec?: number | null;
    target_messages_per_day?: number | null;
  }
): Promise<TeamMemberGoals> {
  return apiFetch(`/api/mobile/team/members/${teamMemberId}/goals`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export interface WhatsAppHealth {
  primary: {
    phoneNumber: string | null;
    provider: string;
    assignmentStatus: string;
    onboardingStatus: string;
    lastError: string | null;
    isHealthy: boolean;
    label: string;
    severity: "ok" | "warn" | "error";
  } | null;
  hasNumbers: boolean;
}

export async function getWhatsAppHealth(): Promise<WhatsAppHealth> {
  return apiFetch(`/api/mobile/whatsapp/health`);
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

export type ExtractedIntentKind =
  | "booking"
  | "complaint"
  | "question"
  | "refund"
  | "other";

export interface ExtractedIntent {
  kind: ExtractedIntentKind;
  summary: string;
  provided: {
    customer_name?: string;
    phone?: string;
    party_size?: number;
    date?: string;
    time?: string;
    notes?: string;
  };
  missing: string[];
  suggested_action: string;
  ready_to_act: boolean;
  extracted_at: string;
}

export interface PendingApproval {
  id: string;
  conversation_id: string;
  customer_name: string | null;
  customer_phone: string;
  type: string;
  status: string;
  created_at: string;
  /** Actual customer message that triggered the escalation. */
  message: string | null;
  /** Machine category (e.g. "knowledge_gap"). Null for older rows. */
  reasonCode: string | null;
  /** Back-compat alias. Prefer `message`. */
  summary: string | null;
  priority?: string | null;
  /** AI-extracted structured context. Null until the extractor runs. */
  extracted_intent: ExtractedIntent | null;
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

// ---- Marketing campaigns ---------------------------------------------------

export interface MarketingTemplate {
  id: string;
  name: string;
  category: string | null;
  language: string | null;
  body_template: string | null;
  header_type: string | null;
  header_text: string | null;
  header_image_url: string | null;
  footer_text: string | null;
  approval_status: string;
  rejection_reason?: string | null;
  buttons?: Array<Record<string, unknown>> | null;
  variables?: string[] | null;
  created_at: string;
  updated_at?: string;
}

export interface MarketingCustomer {
  id: string;
  phone_number: string;
  full_name: string | null;
  source: string;
  last_seen_at: string | null;
  opted_out: boolean;
  created_at: string;
}

export interface MarketingCustomersResponse {
  total: number;
  rows: MarketingCustomer[];
}

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "completed"
  | "partially_completed"
  | "failed";

export interface MarketingCampaignRow {
  id: string;
  name: string;
  template_id: string | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_at: string;
  sending_started_at: string | null;
  sending_completed_at: string | null;
  marketing_templates?: {
    id: string;
    name: string;
    category: string | null;
    language: string | null;
    approval_status: string;
  } | null;
}

export interface CampaignRecipientRow {
  id: string;
  phone_number: string;
  name: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
}

export interface MarketingCampaignDetail {
  campaign: MarketingCampaignRow & {
    error_message: string | null;
    marketing_templates: (MarketingCampaignRow["marketing_templates"] & {
      body_template: string | null;
    }) | null;
  };
  recipients: CampaignRecipientRow[];
}

export type AudienceSelection =
  | { kind: "all" }
  | { kind: "since"; since: string }
  | { kind: "custom"; phones: string[] };

export async function listMarketingTemplates(): Promise<MarketingTemplate[]> {
  return apiFetch(`/api/mobile/marketing/templates`);
}

export async function listAllMarketingTemplates(): Promise<MarketingTemplate[]> {
  return apiFetch(`/api/mobile/marketing/templates?status=all`);
}

export interface CreateMarketingTemplateInput {
  name: string;
  body_template: string;
  language?: string;
  category?: "MARKETING" | "UTILITY";
  header_type?: "none" | "text" | "image";
  header_text?: string | null;
  header_image_url?: string | null;
  footer_text?: string | null;
  buttons?: Array<Record<string, unknown>> | null;
  variables?: string[] | null;
  /** Realistic filled-in values for {{1}}..{{n}} — shown to Meta reviewers. */
  sample_values?: string[] | null;
  submit?: boolean;
}

export async function createMarketingTemplate(
  input: CreateMarketingTemplateInput
): Promise<{ template: MarketingTemplate; submit_error?: string }> {
  return apiFetch(`/api/mobile/marketing/templates`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadTemplateImage(input: {
  base64: string;
  content_type: string;
}): Promise<{ url: string; storage_path: string }> {
  return apiFetch(`/api/mobile/marketing/templates/image`, {
    method: "POST",
    body: JSON.stringify({ mode: "upload", ...input }),
    timeoutMs: 60_000,
  });
}

export async function generateTemplateImage(input: {
  prompt: string;
  language?: "ar" | "en";
  aspect_ratio?: "1:1" | "16:9" | "4:3";
}): Promise<{ url: string; storage_path: string; description?: string }> {
  return apiFetch(`/api/mobile/marketing/templates/image`, {
    method: "POST",
    body: JSON.stringify({ mode: "generate", ...input }),
    timeoutMs: 90_000,
  });
}

export async function listMarketingCustomers(
  opts: { since?: string; limit?: number } = {}
): Promise<MarketingCustomersResponse> {
  const qs = new URLSearchParams();
  if (opts.since) qs.set("since", opts.since);
  if (opts.limit) qs.set("limit", String(opts.limit));
  const q = qs.toString();
  return apiFetch(`/api/mobile/marketing/customers${q ? `?${q}` : ""}`);
}

export async function listMarketingCampaigns(): Promise<MarketingCampaignRow[]> {
  return apiFetch(`/api/mobile/marketing/campaigns`);
}

export async function getMarketingCampaignDetail(
  id: string
): Promise<MarketingCampaignDetail> {
  return apiFetch(`/api/mobile/marketing/campaigns/${id}`);
}

export async function createMarketingCampaign(input: {
  name: string;
  template_id: string;
  scheduled_at?: string | null;
}): Promise<MarketingCampaignRow> {
  return apiFetch(`/api/mobile/marketing/campaigns`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setCampaignAudience(
  campaignId: string,
  selection: AudienceSelection
): Promise<{ total_recipients: number; opted_out_skipped: number }> {
  return apiFetch(`/api/mobile/marketing/campaigns/${campaignId}/audience`, {
    method: "POST",
    body: JSON.stringify(selection),
  });
}

export async function sendMarketingCampaign(
  campaignId: string
): Promise<{
  campaign_id: string;
  status: CampaignStatus;
  total: number;
  sent: number;
  failed: number;
}> {
  return apiFetch(`/api/mobile/marketing/campaigns/${campaignId}/send`, {
    method: "POST",
  });
}

// ---- Customers directory --------------------------------------------------

export interface CustomerDirectoryRow {
  id: string;
  phone_number: string;
  full_name: string | null;
  source: string;
  metadata: Record<string, unknown> | null;
  opted_out: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomersListResponse {
  rows: CustomerDirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listCustomersPaginated(opts: {
  q?: string;
  page?: number;
  pageSize?: number;
  optedOut?: boolean | null;
}): Promise<CustomersListResponse> {
  const qs = new URLSearchParams();
  if (opts.q) qs.set("q", opts.q);
  if (opts.page) qs.set("page", String(opts.page));
  if (opts.pageSize) qs.set("pageSize", String(opts.pageSize));
  if (opts.optedOut === true) qs.set("opted_out", "true");
  if (opts.optedOut === false) qs.set("opted_out", "false");
  const q = qs.toString();
  return apiFetch(`/api/mobile/customers${q ? `?${q}` : ""}`);
}

export async function createCustomer(input: {
  phone_number: string;
  full_name?: string | null;
}): Promise<{ customer: CustomerDirectoryRow }> {
  return apiFetch(`/api/mobile/customers`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCustomer(
  id: string,
  input: {
    full_name?: string | null;
    opted_out?: boolean;
    metadata?: Record<string, unknown> | null;
  }
): Promise<{ customer: CustomerDirectoryRow }> {
  return apiFetch(`/api/mobile/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteCustomer(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/mobile/customers/${id}`, { method: "DELETE" });
}

export async function findOrCreateConversationForPhone(
  phone_number: string
): Promise<{ id: string; is_new: boolean; in_24h_window: boolean }> {
  return apiFetch(`/api/mobile/conversations/find-or-create`, {
    method: "POST",
    body: JSON.stringify({ phone_number }),
  });
}
