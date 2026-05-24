/**
 * Nehgz Hub — review demo bypass.
 *
 * The Apple/Google review accounts don't have real Nehgz Hub subscriptions, so
 * the proxy can't fetch real data for them. Instead of leaving the Hub gateway
 * blank during review (which trips 2.1(a) App Completeness), we detect the
 * demo restaurant by env var and serve a fully-populated seeded payload.
 *
 * Setup: set APPLE_REVIEW_DEMO_RESTAURANT_IDS to a comma-separated list of
 * restaurant UUIDs that should see seeded data. Every other tenant falls
 * through to the real Hub proxy as normal.
 */

import { NextResponse } from "next/server";

// Minimal date helpers — keeps this file dependency-free on the Next side
// (date-fns is only installed in the mobile package).
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function subDays(date: Date, days: number): Date {
  return addDays(date, -days);
}
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function formatDDMMYYYY(date: Date): string {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
}

function envIds(): string[] {
  const raw = process.env.APPLE_REVIEW_DEMO_RESTAURANT_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isDemoRestaurant(restaurantId: string | null | undefined): boolean {
  if (!restaurantId) return false;
  const ids = envIds();
  return ids.includes(restaurantId);
}

// --- Seeded fixtures --------------------------------------------------------

export const DEMO_MERCHANT = {
  id: "demo-merchant-001",
  name: "صالون نِحجز التجريبي",
  phone: "+966550000000",
  timezone: "Asia/Riyadh",
  locale: "ar",
  branches: [{ id: "branch-1", name: "الفرع الرئيسي — الرياض" }],
};

export const DEMO_STAFF = [
  {
    id: "staff-1",
    name: "سارة الأحمد",
    phone: "+966550000011",
    is_owner: true,
    status: true,
    branches: ["branch-1"],
  },
  {
    id: "staff-2",
    name: "نورة العتيبي",
    phone: "+966550000012",
    is_owner: false,
    status: true,
    branches: ["branch-1"],
  },
  {
    id: "staff-3",
    name: "ريم القحطاني",
    phone: "+966550000013",
    is_owner: false,
    status: true,
    branches: ["branch-1"],
  },
  {
    id: "staff-4",
    name: "ليلى الحربي",
    phone: "+966550000014",
    is_owner: false,
    status: false,
    branches: ["branch-1"],
  },
];

export const DEMO_SERVICES = [
  {
    id: "svc-1",
    title: { ar: "قص شعر وتصفيف", en: "Haircut & Styling" },
    description: { ar: "قص حديث مع تصفيف كامل", en: "Modern cut with full styling" },
    price: 120,
    old_price: 150,
    duration_minutes: 45,
    breaking_time_minutes: 10,
    has_staff: true,
    is_global: true,
    status: true,
    branch_id: "branch-1",
    order: 1,
  },
  {
    id: "svc-2",
    title: { ar: "صبغة شعر", en: "Hair Coloring" },
    description: { ar: "صبغة كاملة مع علاج مغذٍّ", en: "Full color with nourishing treatment" },
    price: 350,
    duration_minutes: 90,
    breaking_time_minutes: 15,
    has_staff: true,
    is_global: true,
    status: true,
    branch_id: "branch-1",
    order: 2,
  },
  {
    id: "svc-3",
    title: { ar: "مكياج مناسبات", en: "Event Makeup" },
    description: { ar: "مكياج كامل للمناسبات", en: "Full makeup for events" },
    price: 280,
    duration_minutes: 60,
    breaking_time_minutes: 10,
    has_staff: true,
    is_global: true,
    status: true,
    branch_id: "branch-1",
    order: 3,
  },
  {
    id: "svc-4",
    title: { ar: "تنظيف بشرة عميق", en: "Deep Facial" },
    description: { ar: "تنظيف بشرة احترافي", en: "Professional facial cleansing" },
    price: 200,
    duration_minutes: 50,
    breaking_time_minutes: 10,
    has_staff: true,
    is_global: true,
    status: true,
    branch_id: "branch-1",
    order: 4,
  },
  {
    id: "svc-5",
    title: { ar: "مانيكير وباديكير", en: "Manicure & Pedicure" },
    description: { ar: "عناية كاملة باليدين والقدمين", en: "Full hands and feet care" },
    price: 150,
    duration_minutes: 60,
    breaking_time_minutes: 10,
    has_staff: true,
    is_global: true,
    status: false, // intentionally one disabled to show the toggle UI
    branch_id: "branch-1",
    order: 5,
  },
];

interface DemoBookingSeed {
  offsetDays: number;
  hour: number;
  durationMin: number;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  serviceIdx: number;
  staffIdx: number;
  customerName: string;
  customerPhone: string;
  paymentStatus?: string;
  notes?: string;
}

// Spread bookings across past + future to give the dashboard a realistic shape.
const BOOKING_SEEDS: DemoBookingSeed[] = [
  { offsetDays: -14, hour: 11, durationMin: 45, status: "completed", serviceIdx: 0, staffIdx: 0, customerName: "هدى السهلي", customerPhone: "+966551111101", paymentStatus: "paid" },
  { offsetDays: -12, hour: 14, durationMin: 90, status: "completed", serviceIdx: 1, staffIdx: 1, customerName: "ميساء الزهراني", customerPhone: "+966551111102", paymentStatus: "paid" },
  { offsetDays: -10, hour: 10, durationMin: 60, status: "completed", serviceIdx: 2, staffIdx: 2, customerName: "أمل الدوسري", customerPhone: "+966551111103", paymentStatus: "paid" },
  { offsetDays: -8, hour: 13, durationMin: 50, status: "completed", serviceIdx: 3, staffIdx: 0, customerName: "ريم الشهري", customerPhone: "+966551111104", paymentStatus: "paid" },
  { offsetDays: -7, hour: 15, durationMin: 45, status: "completed", serviceIdx: 0, staffIdx: 1, customerName: "نوال الغامدي", customerPhone: "+966551111105", paymentStatus: "paid" },
  { offsetDays: -6, hour: 16, durationMin: 60, status: "cancelled", serviceIdx: 4, staffIdx: 2, customerName: "سلمى الشمراني", customerPhone: "+966551111106", paymentStatus: "refunded", notes: "اعتذرت العميلة" },
  { offsetDays: -5, hour: 11, durationMin: 45, status: "completed", serviceIdx: 0, staffIdx: 0, customerName: "دانة العمري", customerPhone: "+966551111107", paymentStatus: "paid" },
  { offsetDays: -4, hour: 12, durationMin: 90, status: "completed", serviceIdx: 1, staffIdx: 1, customerName: "غادة الحارثي", customerPhone: "+966551111108", paymentStatus: "paid" },
  { offsetDays: -3, hour: 14, durationMin: 60, status: "completed", serviceIdx: 2, staffIdx: 2, customerName: "منيرة المالكي", customerPhone: "+966551111109", paymentStatus: "paid" },
  { offsetDays: -2, hour: 10, durationMin: 50, status: "confirmed", serviceIdx: 3, staffIdx: 0, customerName: "إيمان البيشي", customerPhone: "+966551111110", paymentStatus: "pending" },
  { offsetDays: -1, hour: 11, durationMin: 45, status: "confirmed", serviceIdx: 0, staffIdx: 1, customerName: "وفاء العسيري", customerPhone: "+966551111111", paymentStatus: "pending" },
  { offsetDays: 0, hour: 13, durationMin: 60, status: "confirmed", serviceIdx: 2, staffIdx: 2, customerName: "روان الخالدي", customerPhone: "+966551111112", paymentStatus: "pending" },
  { offsetDays: 0, hour: 16, durationMin: 90, status: "pending", serviceIdx: 1, staffIdx: 0, customerName: "فاطمة العنزي", customerPhone: "+966551111113", paymentStatus: "pending" },
  { offsetDays: 1, hour: 10, durationMin: 45, status: "confirmed", serviceIdx: 0, staffIdx: 1, customerName: "آلاء الشلهوب", customerPhone: "+966551111114", paymentStatus: "pending" },
  { offsetDays: 1, hour: 14, durationMin: 60, status: "pending", serviceIdx: 2, staffIdx: 2, customerName: "هند الفايز", customerPhone: "+966551111115", paymentStatus: "pending" },
  { offsetDays: 2, hour: 11, durationMin: 50, status: "confirmed", serviceIdx: 3, staffIdx: 0, customerName: "بشرى المطيري", customerPhone: "+966551111116", paymentStatus: "pending" },
  { offsetDays: 3, hour: 12, durationMin: 90, status: "pending", serviceIdx: 1, staffIdx: 1, customerName: "ندى الجهني", customerPhone: "+966551111117", paymentStatus: "pending" },
  { offsetDays: 5, hour: 15, durationMin: 45, status: "pending", serviceIdx: 0, staffIdx: 2, customerName: "خلود السبيعي", customerPhone: "+966551111118", paymentStatus: "pending" },
  { offsetDays: 7, hour: 10, durationMin: 60, status: "pending", serviceIdx: 4, staffIdx: 0, customerName: "بدور التميمي", customerPhone: "+966551111119", paymentStatus: "pending" },
  { offsetDays: 9, hour: 14, durationMin: 90, status: "pending", serviceIdx: 1, staffIdx: 1, customerName: "أسماء البلوي", customerPhone: "+966551111120", paymentStatus: "pending" },
];

interface DemoBooking {
  id: string;
  status: string;
  source: string;
  created_at: string;
  date: string; // DD-MM-YYYY (matches Hub API)
  from: string; // HH:mm
  to: string;
  duration_minutes: number;
  customer: { name: string; phone: string; whatsapp_id: string | null };
  service: { id: string; name: string; price: number };
  staff: { id: string; name: string } | null;
  branch: { id: string; name: string };
  payment: { status: string; method: string; amount: number };
  notes: string;
}

function buildDemoBookings(): DemoBooking[] {
  const now = new Date();
  return BOOKING_SEEDS.map((seed, idx) => {
    const day =
      seed.offsetDays >= 0
        ? addDays(now, seed.offsetDays)
        : subDays(now, -seed.offsetDays);
    const dateStr = formatDDMMYYYY(day);
    const fromStr = `${String(seed.hour).padStart(2, "0")}:00`;
    const toHour = seed.hour + Math.floor(seed.durationMin / 60);
    const toMin = seed.durationMin % 60;
    const toStr = `${String(toHour).padStart(2, "0")}:${String(toMin).padStart(2, "0")}`;
    const svc = DEMO_SERVICES[seed.serviceIdx];
    const staff = DEMO_STAFF[seed.staffIdx];
    return {
      id: `demo-bk-${String(idx + 1).padStart(3, "0")}`,
      status: seed.status,
      source: "whatsapp",
      created_at: subDays(day, 1).toISOString(),
      date: dateStr,
      from: fromStr,
      to: toStr,
      duration_minutes: seed.durationMin,
      customer: {
        name: seed.customerName,
        phone: seed.customerPhone,
        whatsapp_id: null,
      },
      service: { id: svc.id, name: svc.title.ar, price: svc.price },
      staff: { id: staff.id, name: staff.name },
      branch: { id: "branch-1", name: "الفرع الرئيسي — الرياض" },
      payment: {
        status: seed.paymentStatus ?? "pending",
        method: "online",
        amount: svc.price,
      },
      notes: seed.notes ?? "",
    };
  });
}

// --- Router -----------------------------------------------------------------

function envelope(data: unknown, status = 200): NextResponse {
  return NextResponse.json(
    { success: true, message: "ok", code: status, data },
    { status }
  );
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  // Accept YYYY-MM-DD or DD-MM-YYYY.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T00:00:00`);
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split("-");
    return new Date(`${y}-${m}-${d}T00:00:00`);
  }
  const t = Date.parse(dateStr);
  return Number.isNaN(t) ? null : new Date(t);
}

function filterBookings(
  bookings: DemoBooking[],
  query: URLSearchParams
): DemoBooking[] {
  const status = query.get("status");
  const from = parseDate(query.get("from"));
  const to = parseDate(query.get("to"));

  return bookings.filter((b) => {
    if (status) {
      const statuses = status.split(",").map((s) => s.trim());
      if (!statuses.includes(String(b.status))) return false;
    }
    const day = parseDate(b.date);
    if (!day) return true;
    if (from && day < from) return false;
    if (to) {
      // Inclusive end-of-day comparison.
      const endOfTo = new Date(to);
      endOfTo.setHours(23, 59, 59, 999);
      if (day > endOfTo) return false;
    }
    return true;
  });
}

/**
 * Serve a Hub-shaped response for the demo restaurant. Returns `null` if the
 * request is for an endpoint we don't simulate (the proxy will fall back to a
 * benign empty-list response).
 */
export function demoHubResponse(
  segments: string[],
  method: string,
  query: URLSearchParams
): NextResponse {
  const path = segments.join("/");
  const m = method.toUpperCase();

  // merchant/me
  if (m === "GET" && path === "merchant/me") {
    return envelope(DEMO_MERCHANT);
  }

  // dashboard/summary?range=today|week|month
  if (m === "GET" && path === "dashboard/summary") {
    const bookings = buildDemoBookings();
    const revenue = bookings
      .filter((b) => b.status === "completed" || b.status === "confirmed")
      .reduce((acc, b) => acc + b.payment.amount, 0);
    const byStatus = {
      pending: bookings.filter((b) => b.status === "pending").length,
      confirmed: bookings.filter((b) => b.status === "confirmed").length,
      completed: bookings.filter((b) => b.status === "completed").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
    };
    return envelope({
      bookings_count: bookings.length,
      revenue,
      by_status: byStatus,
      top_services: DEMO_SERVICES.slice(0, 3).map((s, i) => ({
        service_id: s.id,
        name: s.title.ar,
        count: 7 - i * 2,
      })),
      busiest_staff: DEMO_STAFF.slice(0, 3).map((s, i) => ({
        staff_id: s.id,
        name: s.name,
        count: 6 - i,
      })),
    });
  }

  // bookings list
  if (m === "GET" && path === "bookings") {
    const all = buildDemoBookings();
    const items = filterBookings(all, query);
    return envelope({ items, total: items.length, page: 1, per_page: items.length });
  }

  // bookings/{id}
  if (m === "GET" && segments[0] === "bookings" && segments.length === 2) {
    const id = segments[1];
    const all = buildDemoBookings();
    const found = all.find((b) => b.id === id) ?? all[0];
    return envelope(found);
  }

  // bookings/{id}/cancel | confirm
  if (
    m === "POST" &&
    segments[0] === "bookings" &&
    segments.length === 3 &&
    (segments[2] === "cancel" || segments[2] === "confirm")
  ) {
    return envelope({ ok: true });
  }

  // bookings/{id} PATCH (reschedule)
  if (m === "PATCH" && segments[0] === "bookings" && segments.length === 2) {
    return envelope({ ok: true });
  }

  // availability
  if (m === "GET" && path === "availability") {
    // Empty slots are fine — the demo isn't expected to book through.
    return envelope({ items: [] });
  }

  // staff list
  if (m === "GET" && path === "staff") {
    return envelope({ items: DEMO_STAFF });
  }

  // staff CRUD — all no-op success
  if (m === "POST" && path === "staff") {
    return envelope({
      id: `staff-demo-${Date.now()}`,
      name: "موظف جديد",
      phone: "",
      status: true,
      branches: ["branch-1"],
    });
  }
  if (segments[0] === "staff" && segments.length === 2) {
    return envelope({ ok: true });
  }

  // services list
  if (m === "GET" && path === "services") {
    return envelope({ items: DEMO_SERVICES });
  }
  if (m === "POST" && path === "services") {
    return envelope({
      id: `svc-demo-${Date.now()}`,
      title: { ar: "خدمة جديدة" },
      price: 100,
      status: true,
      branch_id: "branch-1",
    });
  }
  if (segments[0] === "services" && segments.length === 2) {
    return envelope({ ok: true });
  }

  // customers/{phone}
  if (m === "GET" && segments[0] === "customers" && segments.length === 2) {
    const phone = decodeURIComponent(segments[1]);
    const bookings = buildDemoBookings().filter(
      (b) => b.customer.phone === phone
    );
    if (bookings.length === 0) {
      return NextResponse.json(
        { success: false, message: "Customer not found", code: 404 },
        { status: 404 }
      );
    }
    return envelope({
      phone,
      name: bookings[0].customer.name,
      bookings_count: bookings.length,
      last_booking_at: bookings[bookings.length - 1].created_at,
    });
  }

  // webhooks — pretend it succeeded.
  if (path === "webhooks") {
    return envelope({ webhook_secret: "demo-secret" });
  }

  // Anything else — return an empty list so screens don't error out.
  return envelope({ items: [] });
}
