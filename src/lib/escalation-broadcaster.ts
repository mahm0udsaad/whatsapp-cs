/**
 * escalation-broadcaster — fire-and-forget helper that triggers the
 * /api/internal/broadcast-escalation endpoint.
 *
 * Responsibilities:
 *   - After an escalation order has been inserted by any code path (e.g.
 *     the CS AI Persona flow in src/lib/order-manager.ts), call this helper
 *     to notify on-duty agents via push.
 *   - Swallow all errors. Broadcast is best-effort: Supabase realtime on the
 *     `orders` table is the authoritative path the mobile client listens to.
 *
 * Integration point (for the CS AI Persona agent):
 *   After creating a new escalation order, call:
 *     await triggerEscalationBroadcast(order.id);
 *   Do NOT await its result as meaningful — it already swallows failures.
 *
 * Security:
 *   - Sends CRON_SECRET or AI_REPLY_WORKER_SECRET as Bearer. Chooses whichever
 *     is present in the environment so deployments work both under Vercel
 *     crons and in manual worker setups.
 *   - 5-second timeout per call. Never retries.
 */

const DEFAULT_TIMEOUT_MS = 5_000;

function getBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";
  if (fromEnv.startsWith("http://") || fromEnv.startsWith("https://")) {
    return fromEnv.replace(/\/$/, "");
  }
  return `https://${fromEnv.replace(/\/$/, "")}`;
}

function getInternalSecret(): string | null {
  return (
    process.env.CRON_SECRET ||
    process.env.AI_REPLY_WORKER_SECRET ||
    null
  );
}

export async function triggerEscalationBroadcast(
  orderId: string
): Promise<void> {
  if (!orderId) return;

  const secret = getInternalSecret();
  if (!secret) {
    console.warn(
      "[escalation-broadcaster] no internal secret configured; skipping broadcast"
    );
    return;
  }

  const url = `${getBaseUrl()}/api/internal/broadcast-escalation`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ orderId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        `[escalation-broadcaster] non-2xx for order=${orderId}: ${response.status} ${text.slice(0, 200)}`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error(
      `[escalation-broadcaster] failed for order=${orderId}: ${msg}`
    );
  } finally {
    clearTimeout(timeout);
  }
}
