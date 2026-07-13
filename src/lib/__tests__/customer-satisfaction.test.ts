import { describe, expect, it } from "vitest";
import { calculateSatisfactionMetrics } from "@/lib/customer-satisfaction-metrics";

describe("calculateSatisfactionMetrics", () => {
  it("keeps customer direction, response time, requests, and Nehgz outcomes factual", () => {
    const messages = [
      {
        id: "m1",
        role: "customer",
        content: "هل يوجد موعد؟",
        message_type: "text",
        metadata: {
          media: [{ storage_path: "one" }, { storage_path: "two" }],
        },
        sender_team_member_id: null,
        created_at: "2026-07-13T10:00:00.000Z",
      },
      {
        id: "m2",
        role: "agent",
        content: "نعم، متاح.",
        message_type: "text",
        metadata: null,
        sender_team_member_id: "tm-1",
        created_at: "2026-07-13T10:10:00.000Z",
      },
      {
        id: "m3",
        role: "customer",
        content: "أريد الحجز غداً",
        message_type: "text",
        metadata: null,
        sender_team_member_id: null,
        created_at: "2026-07-13T10:20:00.000Z",
      },
    ];
    const orders = [
      {
        id: "o1",
        type: "reservation",
        status: "pending",
        details: "حجز غداً",
        escalation_reason: null,
        priority: "normal",
        extracted_intent: null,
        assigned_to: null,
        created_at: "2026-07-13T10:20:00.000Z",
        updated_at: "2026-07-13T10:20:00.000Z",
      },
    ];
    const events = [
      {
        event_id: "e1",
        event: "booking.completed",
        occurred_at: "2026-07-13T11:00:00.000Z",
        received_at: "2026-07-13T11:00:00.000Z",
        payload: {},
      },
      {
        event_id: "e2",
        event: "payment.updated",
        occurred_at: "2026-07-13T11:01:00.000Z",
        received_at: "2026-07-13T11:01:00.000Z",
        payload: {},
      },
    ];

    expect(
      calculateSatisfactionMetrics(
        messages as Parameters<typeof calculateSatisfactionMetrics>[0],
        orders as Parameters<typeof calculateSatisfactionMetrics>[1],
        events,
        1
      )
    ).toEqual({
      customer_messages: 2,
      business_messages: 1,
      received_media: 2,
      median_response_minutes: 10,
      last_customer_message_unanswered: true,
      pending_escalations: 0,
      pending_reservations: 1,
      sla_breaches: 1,
      nehgz_bookings: 1,
      nehgz_cancellations: 0,
      nehgz_completions: 1,
      payment_updates: 1,
    });
  });
});
