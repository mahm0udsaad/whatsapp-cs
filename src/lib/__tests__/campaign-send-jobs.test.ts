import { describe, expect, it } from "vitest";

/**
 * Pure-logic tests for the campaign worker behavior. We don't pull in
 * `campaign-send-jobs.ts` itself because that module imports the
 * adminSupabaseClient at top level (which requires SUPABASE env vars), so
 * we mirror the small classifier + backoff schedule here and validate the
 * shape directly. If you change the backoff schedule, update both places.
 */

const BACKOFF_SECONDS = [1, 4, 16, 64, 256];

function classifyTwilioError(err: unknown): "retryable" | "terminal" {
  const e = err as { status?: number; code?: number; message?: string };
  if (e?.status === 429) return "retryable";
  if (typeof e?.status === "number" && e.status >= 500 && e.status < 600)
    return "retryable";
  if (
    typeof e?.message === "string" &&
    /(ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|network)/i.test(e.message)
  )
    return "retryable";
  return "terminal";
}

describe("classifyTwilioError", () => {
  it("treats 429 as retryable", () => {
    expect(classifyTwilioError({ status: 429 })).toBe("retryable");
  });

  it("treats 500/502/503/504 as retryable", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyTwilioError({ status })).toBe("retryable");
    }
  });

  it("treats 4xx (other) as terminal", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(classifyTwilioError({ status })).toBe("terminal");
    }
  });

  it("treats network errors as retryable", () => {
    expect(classifyTwilioError(new Error("ECONNRESET"))).toBe("retryable");
    expect(classifyTwilioError(new Error("fetch failed"))).toBe("retryable");
    expect(classifyTwilioError(new Error("ETIMEDOUT in dns"))).toBe(
      "retryable"
    );
  });

  it("falls back to terminal for unknown errors", () => {
    expect(classifyTwilioError({ message: "weird app-level rejection" })).toBe(
      "terminal"
    );
    expect(classifyTwilioError(undefined)).toBe("terminal");
  });
});

describe("BACKOFF_SECONDS schedule", () => {
  it("is monotonically increasing", () => {
    for (let i = 1; i < BACKOFF_SECONDS.length; i++) {
      expect(BACKOFF_SECONDS[i]).toBeGreaterThan(BACKOFF_SECONDS[i - 1]);
    }
  });

  it("caps at 5 attempts (matches MAX_ATTEMPTS in worker)", () => {
    expect(BACKOFF_SECONDS.length).toBe(5);
  });

  it("starts small (≤2s) so a transient blip recovers within seconds", () => {
    expect(BACKOFF_SECONDS[0]).toBeLessThanOrEqual(2);
  });
});
