/**
 * Expo Push Notification sender.
 *
 * Responsibilities:
 *   - Batch-send push messages to the Expo Push Service (exp.host/--/api/v2/push/send).
 *   - Report per-message delivery results (sent / skipped / errors).
 *   - Surface tokens that Expo reports as DeviceNotRegistered so callers can
 *     disable them at the database layer.
 *
 * Non-goals:
 *   - No retry logic. Callers MUST be idempotent-friendly or invoke twice.
 *   - No persistence. This module is stateless — no DB writes here.
 *
 * Config:
 *   - EXPO_ACCESS_TOKEN (optional): if set, sent as `Authorization: Bearer <token>`.
 *     Works without this header — Expo accepts anonymous requests for unenhanced
 *     delivery.
 *
 * Timeouts:
 *   - Per batch (of up to 100 messages): 10 seconds via AbortController.
 *
 * Security note:
 *   - Push message bodies may include user-facing snippets. Callers should redact
 *     sensitive data (phone numbers etc.) before handing messages to this module.
 */

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "high";
  channelId?: string;
  sound?: "default" | null;
}

export interface SendExpoPushResult {
  sent: number;
  skipped: number;
  invalidTokens: string[];
  errors: Array<{ token: string; message: string }>;
}

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 10_000;

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
    [key: string]: unknown;
  };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket[];
  errors?: Array<{ code?: string; message?: string }>;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function isValidExpoToken(token: string | undefined | null): token is string {
  if (!token) return false;
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["))
  );
}

export async function sendExpoPush(
  messages: ExpoPushMessage[]
): Promise<SendExpoPushResult> {
  const result: SendExpoPushResult = {
    sent: 0,
    skipped: 0,
    invalidTokens: [],
    errors: [],
  };

  if (!messages || messages.length === 0) {
    return result;
  }

  // Drop obviously-malformed tokens before contacting Expo.
  const valid: ExpoPushMessage[] = [];
  for (const m of messages) {
    if (!isValidExpoToken(m.to)) {
      result.skipped += 1;
      continue;
    }
    valid.push(m);
  }

  if (valid.length === 0) {
    return result;
  }

  const accessToken = process.env.EXPO_ACCESS_TOKEN;

  for (const batch of chunk(valid, BATCH_SIZE)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      };
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        for (const m of batch) {
          result.errors.push({
            token: m.to,
            message: `HTTP ${response.status}: ${text.slice(0, 200)}`,
          });
        }
        continue;
      }

      const json = (await response.json()) as ExpoPushResponse;
      const tickets = Array.isArray(json.data) ? json.data : [];

      for (let i = 0; i < batch.length; i++) {
        const message = batch[i];
        const ticket = tickets[i];
        if (!ticket) {
          result.errors.push({
            token: message.to,
            message: "No ticket returned by Expo",
          });
          continue;
        }
        if (ticket.status === "ok") {
          result.sent += 1;
          continue;
        }
        // error ticket
        const detail = ticket.details?.error;
        if (detail === "DeviceNotRegistered") {
          result.invalidTokens.push(message.to);
        }
        result.errors.push({
          token: message.to,
          message: ticket.message || detail || "Expo ticket error",
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === "AbortError"
            ? `Timeout after ${REQUEST_TIMEOUT_MS}ms`
            : err.message
          : "Unknown error";
      for (const m of batch) {
        result.errors.push({ token: m.to, message: msg });
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return result;
}
