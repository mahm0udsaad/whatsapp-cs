/**
 * Ordering rules for Twilio delivery-status callbacks.
 *
 * Twilio does not guarantee callback order, so a late "sent" can arrive after
 * "undelivered". A status is only applied when it moves the message forward;
 * failures are terminal and always win over in-flight states.
 */

const STATUS_RANK: Record<string, number> = {
  queued: 0,
  accepted: 0,
  scheduled: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  // Terminal failures. Meta refusals (e.g. 63049 marketing limit, 63016
  // outside the 24h window) arrive as "undelivered", not "failed".
  undelivered: 10,
  failed: 10,
};

export function isDeliveryFailure(status: string | null | undefined): boolean {
  return status === "failed" || status === "undelivered";
}

export function shouldApplyDeliveryStatus(
  current: string | null | undefined,
  next: string
): boolean {
  const nextRank = STATUS_RANK[next];
  if (nextRank === undefined) return false;
  const currentRank = current ? STATUS_RANK[current] ?? -1 : -1;
  return nextRank > currentRank;
}
