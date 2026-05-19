/**
 * Nehgz Hub API client.
 *
 * Every call is proxied through the Next.js backend (`/api/mobile/hub/*`),
 * which holds the per-merchant access token and base URL. The mobile app
 * never talks to the Hub host directly.
 *
 * The Hub wraps responses in an envelope `{ success, message, code, data }`.
 * `hubProxy` unwraps `data` automatically.
 */

import { apiFetch } from "./api";

export interface HubMerchant {
  id: string | null;
  name: string | null;
  phone: string | null;
  timezone: string | null;
  locale: string | null;
}

export interface HubStatus {
  paired: boolean;
  merchant?: HubMerchant;
  pairedAt?: string;
}

/** Raised when the Hub reports the stored token is no longer valid. */
export class HubRepairNeededError extends Error {
  constructor() {
    super("Nehgz Hub session expired");
    this.name = "HubRepairNeededError";
  }
}

export async function getHubStatus(): Promise<HubStatus> {
  return apiFetch("/api/mobile/hub/status");
}

export async function pairHub(
  email: string,
  pairingCode: string
): Promise<{ paired: true; merchant: HubMerchant }> {
  return apiFetch("/api/mobile/hub/pair", {
    method: "POST",
    body: JSON.stringify({ email, pairing_code: pairingCode }),
  });
}

export async function unpairHub(): Promise<{ ok: true }> {
  return apiFetch("/api/mobile/hub/status", { method: "DELETE" });
}

interface HubEnvelope<T> {
  success?: boolean;
  message?: string;
  code?: number;
  data?: T;
}

function unwrap<T>(raw: unknown): T {
  if (
    raw &&
    typeof raw === "object" &&
    "success" in raw &&
    "data" in (raw as Record<string, unknown>)
  ) {
    return (raw as HubEnvelope<T>).data as T;
  }
  return raw as T;
}

/**
 * Proxy a request to the Hub API. `path` is the part after `/api/v1/`,
 * e.g. `bookings?status=pending` or `bookings/<id>/cancel`.
 */
export async function hubProxy<T = unknown>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  try {
    const raw = await apiFetch(`/api/mobile/hub/proxy/${path}`, init);
    return unwrap<T>(raw);
  } catch (e) {
    const err = e as { status?: number; body?: { code?: string } };
    if (err?.status === 401 && err?.body?.code === "repair_needed") {
      throw new HubRepairNeededError();
    }
    throw e;
  }
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---- Merchant -------------------------------------------------------------

export interface HubMerchantProfile {
  id?: string | number;
  name?: string;
  phone?: string;
  timezone?: string;
  locale?: string;
  branches?: { id: string; name?: string }[];
  [key: string]: unknown;
}

export async function getHubMerchant(): Promise<HubMerchantProfile> {
  return hubProxy<HubMerchantProfile>("merchant/me");
}

// ---- Dashboard ------------------------------------------------------------

export type DashboardRange = "today" | "week" | "month";

export interface HubStatusBreakdown {
  confirmed?: number;
  pending?: number;
  cancelled?: number;
  completed?: number;
}

export interface HubTopService {
  service_id: string;
  name: string;
  count: number;
}

export interface HubBusiestStaff {
  staff_id: string;
  name: string;
  count: number;
}

export interface HubDashboardSummary {
  bookings_count?: number;
  revenue?: number;
  by_status?: HubStatusBreakdown;
  top_services?: HubTopService[];
  busiest_staff?: HubBusiestStaff[];
}

export async function getHubDashboardSummary(
  range: DashboardRange = "today",
  branchId?: string
): Promise<HubDashboardSummary> {
  return hubProxy<HubDashboardSummary>(
    `dashboard/summary${qs({ range, branch_id: branchId })}`
  );
}

// ---- Bookings -------------------------------------------------------------

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed";

/** Raw booking shape as returned by the Hub API (nested objects). */
interface HubBookingRaw {
  id: string;
  status?: string;
  source?: string;
  created_at?: string;
  date?: string; // DD-MM-YYYY
  from?: string;
  to?: string;
  duration_minutes?: number;
  customer?: { name?: string; phone?: string; whatsapp_id?: string | null };
  service?: { id?: string; name?: string; price?: number };
  staff?: { id?: string; name?: string } | null;
  branch?: { id?: string; name?: string };
  payment?: { status?: string; method?: string; amount?: number };
  notes?: string;
}

/** Flat, app-facing booking shape — what the screens consume. */
export interface HubBooking {
  id: string;
  status?: BookingStatus | string;
  source?: string;
  date?: string;
  time_from?: string;
  time_to?: string;
  duration_minutes?: number;
  staff_id?: string | null;
  staff_name?: string | null;
  service_id?: string | null;
  service_title?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  branch_name?: string | null;
  price?: number | null;
  payment_amount?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  notes?: string | null;
  created_at?: string;
}

function normalizeBooking(raw: HubBookingRaw): HubBooking {
  const name = raw.customer?.name?.trim();
  return {
    id: raw.id,
    status: raw.status,
    source: raw.source,
    date: raw.date,
    time_from: raw.from,
    time_to: raw.to,
    duration_minutes: raw.duration_minutes,
    staff_id: raw.staff?.id ?? null,
    staff_name: raw.staff?.name ?? null,
    service_id: raw.service?.id ?? null,
    service_title: raw.service?.name ?? null,
    customer_name: name && name.length > 0 ? name : null,
    customer_phone: raw.customer?.phone ?? null,
    branch_name: raw.branch?.name ?? null,
    price: raw.service?.price ?? raw.payment?.amount ?? null,
    payment_amount: raw.payment?.amount ?? null,
    currency: "ر.س",
    payment_status: raw.payment?.status ?? null,
    notes: raw.notes ?? null,
    created_at: raw.created_at,
  };
}

export async function listHubBookings(opts: {
  status?: string;
  from?: string;
  to?: string;
  branchId?: string;
}): Promise<HubBooking[]> {
  const res = await hubProxy<HubBookingRaw[] | { items?: HubBookingRaw[] }>(
    `bookings${qs({
      status: opts.status,
      from: opts.from,
      to: opts.to,
      branch_id: opts.branchId,
    })}`
  );
  const items = Array.isArray(res) ? res : res?.items ?? [];
  return items.map(normalizeBooking);
}

interface HubBookingsPage {
  items?: HubBookingRaw[];
  page?: number;
  per_page?: number;
  total?: number;
  count?: number;
}

/**
 * Fetch every booking in a date range, following pagination. Used by the
 * dashboard to aggregate daily volume / revenue series client-side.
 */
export async function listAllHubBookings(opts: {
  from?: string;
  to?: string;
  status?: string;
  branchId?: string;
}): Promise<HubBooking[]> {
  const all: HubBooking[] = [];
  let page = 1;
  // Hard cap so a misbehaving API can never spin forever.
  for (let guard = 0; guard < 50; guard++) {
    const res = await hubProxy<HubBookingsPage>(
      `bookings${qs({
        status: opts.status,
        from: opts.from,
        to: opts.to,
        branch_id: opts.branchId,
        page,
      })}`
    );
    const items = res?.items ?? [];
    all.push(...items.map(normalizeBooking));
    const total = res?.total ?? all.length;
    if (items.length === 0 || all.length >= total) break;
    page += 1;
  }
  return all;
}

export async function getHubBooking(id: string): Promise<HubBooking> {
  const raw = await hubProxy<HubBookingRaw>(`bookings/${id}`);
  return normalizeBooking(raw);
}

export async function rescheduleHubBooking(
  id: string,
  input: {
    date: string;
    time_from: string;
    time_to: string;
    staff_id?: string | number;
  }
): Promise<void> {
  await hubProxy(`bookings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function cancelHubBooking(
  id: string,
  reason: string
): Promise<void> {
  await hubProxy(`bookings/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function confirmHubBooking(id: string): Promise<void> {
  await hubProxy(`bookings/${id}/confirm`, { method: "POST" });
}

// ---- Availability ---------------------------------------------------------

export interface HubSlot {
  date?: string;
  from?: string;
  to?: string;
  staff_id?: number | null;
  available?: boolean;
  [key: string]: unknown;
}

export async function getHubSlots(opts: {
  serviceId: number | string;
  branchId?: string;
  staffId?: number | string;
  from?: string;
  to?: string;
}): Promise<HubSlot[]> {
  const res = await hubProxy<HubSlot[] | { items?: HubSlot[] }>(
    `availability${qs({
      service_id: opts.serviceId,
      branch_id: opts.branchId,
      staff_id: opts.staffId,
      from: opts.from,
      to: opts.to,
    })}`
  );
  return Array.isArray(res) ? res : res?.items ?? [];
}

// ---- Staff ----------------------------------------------------------------

export interface HubStaff {
  id: string | number;
  name?: string;
  phone?: string;
  is_owner?: boolean;
  branches?: string[];
  [key: string]: unknown;
}

export async function listHubStaff(branchId?: string): Promise<HubStaff[]> {
  const res = await hubProxy<HubStaff[] | { items?: HubStaff[] }>(
    `staff${qs({ branch_id: branchId })}`
  );
  return Array.isArray(res) ? res : res?.items ?? [];
}

export async function createHubStaff(input: {
  name: string;
  phone: string;
  username?: string;
  email?: string;
  branch_ids?: string[];
}): Promise<HubStaff> {
  return hubProxy<HubStaff>("staff", {
    method: "POST",
    body: JSON.stringify({ branch_ids: [], ...input }),
  });
}

export async function updateHubStaff(
  id: string | number,
  input: {
    name?: string;
    phone?: string;
    status?: boolean;
    branch_ids?: string[];
  }
): Promise<HubStaff> {
  return hubProxy<HubStaff>(`staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteHubStaff(id: string | number): Promise<unknown> {
  return hubProxy(`staff/${id}`, { method: "DELETE" });
}

// ---- Services -------------------------------------------------------------

export interface HubLocalized {
  ar?: string;
  en?: string;
}

export interface HubService {
  id: string | number;
  title?: HubLocalized | string;
  description?: HubLocalized | string;
  price?: number;
  old_price?: number | null;
  duration_minutes?: number;
  breaking_time_minutes?: number;
  has_staff?: boolean;
  is_global?: boolean;
  status?: boolean;
  branch_id?: string;
  order?: number;
  [key: string]: unknown;
}

export async function listHubServices(opts: {
  branchId?: string;
  onlyActive?: boolean;
  cursor?: string;
  limit?: number;
} = {}): Promise<HubService[]> {
  const res = await hubProxy<HubService[] | { items?: HubService[] }>(
    `services${qs({
      branch_id: opts.branchId,
      only_active: opts.onlyActive ? "1" : undefined,
      cursor: opts.cursor,
      limit: opts.limit ?? 50,
    })}`
  );
  return Array.isArray(res) ? res : res?.items ?? [];
}

export async function createHubService(
  input: Record<string, unknown>
): Promise<HubService> {
  return hubProxy<HubService>("services", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateHubService(
  id: string | number,
  input: Record<string, unknown>
): Promise<HubService> {
  return hubProxy<HubService>(`services/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteHubService(
  id: string | number
): Promise<unknown> {
  return hubProxy(`services/${id}`, { method: "DELETE" });
}

// ---- Customers ------------------------------------------------------------

export interface HubCustomer {
  phone?: string;
  name?: string;
  bookings_count?: number;
  last_booking_at?: string;
  [key: string]: unknown;
}

export async function getHubCustomer(phone: string): Promise<HubCustomer> {
  return hubProxy<HubCustomer>(`customers/${encodeURIComponent(phone)}`);
}

// ---- Webhooks -------------------------------------------------------------

export type HubWebhookEvent =
  | "booking.created"
  | "booking.updated"
  | "booking.cancelled"
  | "booking.completed"
  | "payment.updated";

export async function registerHubWebhook(
  url: string,
  events: HubWebhookEvent[]
): Promise<{ webhook_secret?: string }> {
  return hubProxy<{ webhook_secret?: string }>("webhooks", {
    method: "PUT",
    body: JSON.stringify({ url, events }),
  });
}
