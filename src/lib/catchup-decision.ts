/**
 * Pure decision logic for the "return to bot" catch-up, isolated from any
 * Supabase/runtime imports so it can be unit-tested directly.
 */

/** A reply that "answers" a customer message: a human agent or the AI bot. */
const REPLY_ROLES = new Set(["agent", "assistant"]);

export interface CatchUpMessage {
  id: string;
  role: string;
  created_at: string;
}

/**
 * Decide which customer message (if any) the bot must answer when a
 * conversation is returned to the bot.
 *
 * Rule (mirrors the manual takeover → return-to-bot requirement):
 *   - Find the most recent CUSTOMER message.
 *   - If a reply (agent or assistant) exists AFTER it, the agent already
 *     responded → return null so the bot waits for the next customer message.
 *   - Otherwise the last customer message is unanswered → return its id so the
 *     bot replies now.
 *
 * `messages` may be in any order; only role + created_at are used. Unrelated
 * roles (e.g. system notes) neither answer nor reset the check.
 */
export function findUnansweredCustomerMessageId(
  messages: CatchUpMessage[]
): string | null {
  let lastCustomer: CatchUpMessage | null = null;
  for (const m of messages) {
    if (m.role !== "customer") continue;
    if (!lastCustomer || m.created_at > lastCustomer.created_at) {
      lastCustomer = m;
    }
  }
  if (!lastCustomer) return null;

  const answered = messages.some(
    (m) => REPLY_ROLES.has(m.role) && m.created_at > lastCustomer!.created_at
  );
  return answered ? null : lastCustomer.id;
}
