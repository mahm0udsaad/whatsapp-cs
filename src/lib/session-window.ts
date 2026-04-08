/**
 * WhatsApp 24-hour session window enforcement.
 *
 * WhatsApp Business API rules:
 * - After a customer sends an inbound message, businesses have 24 hours to send free-form replies.
 * - Outside the 24-hour window, only pre-approved template messages can be sent.
 * - Sending free-form messages outside the window results in Twilio error 63016.
 */

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if the 24-hour session window is still open for a conversation.
 *
 * @param lastInboundAt - ISO timestamp of the last customer inbound message
 * @returns true if within the 24-hour window, false if expired
 */
export function isSessionWindowOpen(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;

  const lastInbound = new Date(lastInboundAt).getTime();
  const now = Date.now();

  return now - lastInbound < SESSION_WINDOW_MS;
}

/**
 * Get remaining time in the session window.
 *
 * @param lastInboundAt - ISO timestamp of the last customer inbound message
 * @returns remaining milliseconds, or 0 if window is closed
 */
export function getSessionWindowRemaining(lastInboundAt: string | null | undefined): number {
  if (!lastInboundAt) return 0;

  const lastInbound = new Date(lastInboundAt).getTime();
  const expiresAt = lastInbound + SESSION_WINDOW_MS;
  const remaining = expiresAt - Date.now();

  return Math.max(0, remaining);
}
