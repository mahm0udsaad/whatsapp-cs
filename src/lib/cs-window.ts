/**
 * Pure helper for the Twilio 24h customer-service window check.
 *
 * Lives in its own module (not in `src/lib/conversations.ts`) so tests can
 * import it without dragging in the admin Supabase client and its env
 * requirements.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function isInTwilioCsWindow(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < DAY_MS;
}
