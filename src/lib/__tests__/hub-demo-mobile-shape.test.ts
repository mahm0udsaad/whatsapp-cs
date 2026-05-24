/**
 * End-to-end shape check: the demo Hub payloads must satisfy the mobile
 * client's parsers, otherwise the reviewer sees crashes/empty screens
 * even though the server returned 200.
 *
 * We replicate the mobile parsing logic from mobile/lib/hub-api.ts here
 * because the mobile package is excluded from tsconfig and can't be
 * imported directly from a Next-side test.
 */

import { describe, it, expect } from "vitest";
import { demoHubResponse } from "@/lib/hub-demo";

interface RawBooking {
  id: string;
  status?: string;
  source?: string;
  created_at?: string;
  date?: string;
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

interface NormalisedBooking {
  id: string;
  status?: string;
  date?: string;
  staff_name?: string | null;
  service_title?: string | null;
  customer_name?: string | null;
  price?: number | null;
  payment_amount?: number | null;
  currency?: string | null;
}

// Mirrors mobile/lib/hub-api.ts → normalizeBooking
function normalizeBooking(raw: RawBooking): NormalisedBooking {
  const name = raw.customer?.name?.trim();
  return {
    id: raw.id,
    status: raw.status,
    date: raw.date,
    staff_name: raw.staff?.name ?? null,
    service_title: raw.service?.name ?? null,
    customer_name: name && name.length > 0 ? name : null,
    price: raw.service?.price ?? raw.payment?.amount ?? null,
    payment_amount: raw.payment?.amount ?? null,
    currency: "ر.س",
  };
}

async function readEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { data: T };
  return body.data;
}

describe("demo Hub payloads ↔ mobile parser", () => {
  it("every demo booking normalises with a customer name, service title, and price", async () => {
    const res = demoHubResponse(["bookings"], "GET", new URLSearchParams());
    const data = await readEnvelope<{ items: RawBooking[]; total: number }>(res);
    expect(data.items.length).toBeGreaterThan(10);
    for (const raw of data.items) {
      const n = normalizeBooking(raw);
      expect(n.id).toMatch(/^demo-bk-/);
      expect(n.status).toMatch(/^(pending|confirmed|completed|cancelled)$/);
      expect(n.date).toMatch(/^\d{2}-\d{2}-\d{4}$/);
      expect(n.customer_name).toBeTruthy();
      expect(n.service_title).toBeTruthy();
      expect(n.staff_name).toBeTruthy();
      expect(n.price).toBeGreaterThan(0);
      expect(n.payment_amount).toBeGreaterThan(0);
    }
  });

  it("bookings include a mix of statuses so the dashboard chart isn't flat", async () => {
    const res = demoHubResponse(["bookings"], "GET", new URLSearchParams());
    const data = await readEnvelope<{ items: RawBooking[] }>(res);
    const statuses = new Set(data.items.map((b) => b.status));
    expect(statuses.has("pending")).toBe(true);
    expect(statuses.has("confirmed")).toBe(true);
    expect(statuses.has("completed")).toBe(true);
    expect(statuses.has("cancelled")).toBe(true);
  });

  it("the listAllHubBookings pagination loop terminates on a single page", async () => {
    // Mirror the loop in mobile/lib/hub-api.ts → listAllHubBookings.
    const all: RawBooking[] = [];
    let page = 1;
    let guard = 0;
    while (guard++ < 5) {
      const res = demoHubResponse(
        ["bookings"],
        "GET",
        new URLSearchParams({ page: String(page) })
      );
      const data = await readEnvelope<{
        items: RawBooking[];
        total: number;
      }>(res);
      all.push(...data.items);
      const total = data.total ?? all.length;
      if (data.items.length === 0 || all.length >= total) break;
      page += 1;
    }
    expect(guard).toBeLessThanOrEqual(2);
    expect(all.length).toBeGreaterThan(0);
  });
});
