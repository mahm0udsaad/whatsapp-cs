import type { SatisfactionMetrics } from "@/lib/customer-satisfaction-types";

export interface SatisfactionMetricMessage {
  role: "customer" | "agent" | "system";
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface SatisfactionMetricOrder {
  type: "reservation" | "escalation";
  status: string;
}

export interface SatisfactionMetricEvent {
  event: string;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return Math.round(value * 10) / 10;
}

export function calculateSatisfactionMetrics(
  messages: SatisfactionMetricMessage[],
  orders: SatisfactionMetricOrder[],
  events: SatisfactionMetricEvent[],
  slaBreaches: number
): SatisfactionMetrics {
  const responseMinutes: number[] = [];
  let pendingCustomerAt: number | null = null;

  for (const message of messages) {
    const at = new Date(message.created_at).getTime();
    if (message.role === "customer") {
      if (pendingCustomerAt === null) pendingCustomerAt = at;
    } else if (message.role === "agent" && pendingCustomerAt !== null) {
      responseMinutes.push(Math.max(0, (at - pendingCustomerAt) / 60_000));
      pendingCustomerAt = null;
    }
  }

  const lastCustomerIndex = messages.findLastIndex(
    (message) => message.role === "customer"
  );
  const lastBusinessIndex = messages.findLastIndex(
    (message) => message.role === "agent"
  );

  const receivedMedia = messages.reduce((total, message) => {
    if (message.role !== "customer") return total;
    const media = message.metadata?.media;
    return total + (Array.isArray(media) ? media.length : 0);
  }, 0);

  return {
    customer_messages: messages.filter((message) => message.role === "customer")
      .length,
    business_messages: messages.filter((message) => message.role === "agent")
      .length,
    received_media: receivedMedia,
    median_response_minutes: median(responseMinutes),
    last_customer_message_unanswered:
      lastCustomerIndex >= 0 && lastCustomerIndex > lastBusinessIndex,
    pending_escalations: orders.filter(
      (order) => order.type === "escalation" && order.status === "pending"
    ).length,
    pending_reservations: orders.filter(
      (order) => order.type === "reservation" && order.status === "pending"
    ).length,
    sla_breaches: slaBreaches,
    nehgz_bookings: events.filter((event) => event.event.startsWith("booking."))
      .length,
    nehgz_cancellations: events.filter(
      (event) => event.event === "booking.cancelled"
    ).length,
    nehgz_completions: events.filter(
      (event) => event.event === "booking.completed"
    ).length,
    payment_updates: events.filter((event) => event.event === "payment.updated")
      .length,
  };
}
