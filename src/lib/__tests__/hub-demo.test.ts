import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEMO_MERCHANT,
  DEMO_SERVICES,
  DEMO_STAFF,
  demoHubResponse,
  isDemoRestaurant,
} from "@/lib/hub-demo";

const DEMO_ID = "00000000-0000-0000-0000-000000000001";
const REAL_ID = "00000000-0000-0000-0000-000000000999";

interface Envelope<T> {
  success: boolean;
  message: string;
  code: number;
  data: T;
}

async function parse<T>(res: Response): Promise<{
  status: number;
  body: Envelope<T> | { success: false; message: string; code: number };
}> {
  const body = (await res.json()) as Envelope<T>;
  return { status: res.status, body };
}

describe("isDemoRestaurant", () => {
  const originalEnv = process.env.APPLE_REVIEW_DEMO_RESTAURANT_IDS;

  beforeEach(() => {
    process.env.APPLE_REVIEW_DEMO_RESTAURANT_IDS = DEMO_ID;
  });
  afterEach(() => {
    process.env.APPLE_REVIEW_DEMO_RESTAURANT_IDS = originalEnv;
  });

  it("returns true for a restaurant in the env list", () => {
    expect(isDemoRestaurant(DEMO_ID)).toBe(true);
  });
  it("returns false for restaurants not in the env list", () => {
    expect(isDemoRestaurant(REAL_ID)).toBe(false);
  });
  it("returns false for empty/null restaurant ids", () => {
    expect(isDemoRestaurant("")).toBe(false);
    expect(isDemoRestaurant(null)).toBe(false);
    expect(isDemoRestaurant(undefined)).toBe(false);
  });
  it("supports comma-separated lists with whitespace", () => {
    process.env.APPLE_REVIEW_DEMO_RESTAURANT_IDS = ` ${DEMO_ID} , ${REAL_ID}`;
    expect(isDemoRestaurant(DEMO_ID)).toBe(true);
    expect(isDemoRestaurant(REAL_ID)).toBe(true);
  });
  it("returns false when env var is unset", () => {
    delete process.env.APPLE_REVIEW_DEMO_RESTAURANT_IDS;
    expect(isDemoRestaurant(DEMO_ID)).toBe(false);
  });
});

describe("demoHubResponse", () => {
  it("returns the seeded merchant for GET merchant/me", async () => {
    const res = demoHubResponse(["merchant", "me"], "GET", new URLSearchParams());
    const { status, body } = await parse(res);
    expect(status).toBe(200);
    expect((body as Envelope<typeof DEMO_MERCHANT>).success).toBe(true);
    expect((body as Envelope<typeof DEMO_MERCHANT>).data.name).toBe(
      DEMO_MERCHANT.name
    );
  });

  it("returns a dashboard summary with bookings_count and revenue", async () => {
    const res = demoHubResponse(
      ["dashboard", "summary"],
      "GET",
      new URLSearchParams({ range: "month" })
    );
    const { status, body } = await parse(res);
    expect(status).toBe(200);
    const data = (body as Envelope<{
      bookings_count: number;
      revenue: number;
      by_status: { confirmed: number; pending: number; completed: number; cancelled: number };
      top_services: { service_id: string; name: string; count: number }[];
      busiest_staff: { staff_id: string; name: string; count: number }[];
    }>).data;
    expect(data.bookings_count).toBeGreaterThan(0);
    expect(data.revenue).toBeGreaterThan(0);
    expect(data.by_status.confirmed).toBeGreaterThan(0);
    expect(data.top_services.length).toBe(3);
    expect(data.busiest_staff.length).toBe(3);
  });

  it("lists bookings with the page envelope the client expects", async () => {
    const res = demoHubResponse(["bookings"], "GET", new URLSearchParams());
    const { status, body } = await parse(res);
    expect(status).toBe(200);
    const data = (body as Envelope<{
      items: Array<{
        id: string;
        status: string;
        date: string;
        from: string;
        to: string;
        customer: { name: string; phone: string };
        service: { id: string; name: string; price: number };
        staff: { id: string; name: string };
        payment: { amount: number };
      }>;
      total: number;
    }>).data;
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.length).toBe(data.total);
    // Hub date shape is DD-MM-YYYY.
    expect(data.items[0].date).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    expect(data.items[0].from).toMatch(/^\d{2}:\d{2}$/);
    expect(data.items[0].customer.name).toBeTruthy();
    expect(data.items[0].service.price).toBeGreaterThan(0);
    expect(data.items[0].staff.name).toBeTruthy();
  });

  it("filters bookings by status", async () => {
    const res = demoHubResponse(
      ["bookings"],
      "GET",
      new URLSearchParams({ status: "confirmed" })
    );
    const { body } = await parse(res);
    const data = (body as Envelope<{ items: Array<{ status: string }>; total: number }>).data;
    expect(data.items.length).toBeGreaterThan(0);
    for (const item of data.items) {
      expect(item.status).toBe("confirmed");
    }
  });

  it("filters bookings by date range (yyyy-MM-dd)", async () => {
    // Today only — should return at least one booking (we seeded offsetDays=0).
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(today.getDate()).padStart(2, "0")}`;
    const res = demoHubResponse(
      ["bookings"],
      "GET",
      new URLSearchParams({ from: ymd, to: ymd })
    );
    const { body } = await parse(res);
    const data = (body as Envelope<{ items: Array<{ date: string }> }>).data;
    expect(data.items.length).toBeGreaterThan(0);
  });

  it("returns a single booking detail for GET bookings/:id", async () => {
    const res = demoHubResponse(
      ["bookings", "demo-bk-001"],
      "GET",
      new URLSearchParams()
    );
    const { status, body } = await parse(res);
    expect(status).toBe(200);
    const data = (body as Envelope<{ id: string }>).data;
    expect(data.id).toBe("demo-bk-001");
  });

  it("acknowledges confirm + cancel + reschedule mutations", async () => {
    for (const segments of [
      ["bookings", "demo-bk-001", "confirm"],
      ["bookings", "demo-bk-001", "cancel"],
    ]) {
      const res = demoHubResponse(segments, "POST", new URLSearchParams());
      const { status, body } = await parse(res);
      expect(status).toBe(200);
      expect((body as Envelope<{ ok: boolean }>).data.ok).toBe(true);
    }
    const res = demoHubResponse(
      ["bookings", "demo-bk-001"],
      "PATCH",
      new URLSearchParams()
    );
    expect(res.status).toBe(200);
  });

  it("lists the seeded staff and services", async () => {
    const staffRes = demoHubResponse(["staff"], "GET", new URLSearchParams());
    const staffBody = (await parse(staffRes)).body as Envelope<{
      items: typeof DEMO_STAFF;
    }>;
    expect(staffBody.data.items.length).toBe(DEMO_STAFF.length);

    const svcRes = demoHubResponse(["services"], "GET", new URLSearchParams());
    const svcBody = (await parse(svcRes)).body as Envelope<{
      items: typeof DEMO_SERVICES;
    }>;
    expect(svcBody.data.items.length).toBe(DEMO_SERVICES.length);
    // At least one service should be disabled (status=false) so the toggle UI is exercised.
    expect(svcBody.data.items.some((s) => s.status === false)).toBe(true);
  });

  it("creates a stub staff member on POST staff", async () => {
    const res = demoHubResponse(["staff"], "POST", new URLSearchParams());
    const { status, body } = await parse(res);
    expect(status).toBe(200);
    expect((body as Envelope<{ id: string }>).data.id).toMatch(/^staff-demo-/);
  });

  it("returns 404 for an unknown customer phone", async () => {
    const res = demoHubResponse(
      ["customers", "+966500999000"],
      "GET",
      new URLSearchParams()
    );
    expect(res.status).toBe(404);
  });

  it("returns the customer summary for a known phone", async () => {
    const res = demoHubResponse(
      ["customers", encodeURIComponent("+966551111101")],
      "GET",
      new URLSearchParams()
    );
    const { status, body } = await parse(res);
    expect(status).toBe(200);
    const data = (body as Envelope<{ name: string; bookings_count: number }>).data;
    expect(data.name).toBeTruthy();
    expect(data.bookings_count).toBeGreaterThan(0);
  });

  it("falls through to an empty list for unrecognised paths", async () => {
    const res = demoHubResponse(
      ["reports", "anything"],
      "GET",
      new URLSearchParams()
    );
    const { status, body } = await parse(res);
    expect(status).toBe(200);
    expect((body as Envelope<{ items: unknown[] }>).data.items).toEqual([]);
  });
});
