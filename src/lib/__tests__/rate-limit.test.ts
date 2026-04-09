import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request with correct remaining count", () => {
    const result = checkRateLimit("first-request-key", { limit: 5, windowSeconds: 60 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1);
  });

  it("tracks separate keys independently", () => {
    const opts = { limit: 3, windowSeconds: 60 };

    checkRateLimit("key-a", opts);
    checkRateLimit("key-a", opts);

    const resultA = checkRateLimit("key-a", opts);
    const resultB = checkRateLimit("key-b", opts);

    expect(resultA.remaining).toBe(0);
    expect(resultB.remaining).toBe(2);
  });

  it("blocks after limit is exceeded", () => {
    const opts = { limit: 2, windowSeconds: 60 };

    checkRateLimit("block-key", opts);
    checkRateLimit("block-key", opts);
    const result = checkRateLimit("block-key", opts);

    expect(result.allowed).toBe(false);
  });

  it("returns remaining=0 when blocked", () => {
    const opts = { limit: 1, windowSeconds: 60 };

    checkRateLimit("remaining-key", opts);
    const result = checkRateLimit("remaining-key", opts);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after the window expires", () => {
    const opts = { limit: 1, windowSeconds: 10 };

    checkRateLimit("reset-key", opts);
    const blocked = checkRateLimit("reset-key", opts);
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(11_000);

    const afterReset = checkRateLimit("reset-key", opts);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(0);
  });
});

describe("RATE_LIMITS presets", () => {
  it("has expected values for webhook", () => {
    expect(RATE_LIMITS.webhook).toEqual({ limit: 60, windowSeconds: 60 });
  });

  it("has expected values for dashboardApi", () => {
    expect(RATE_LIMITS.dashboardApi).toEqual({ limit: 30, windowSeconds: 60 });
  });

  it("has expected values for menuCrawl", () => {
    expect(RATE_LIMITS.menuCrawl).toEqual({ limit: 5, windowSeconds: 60 });
  });

  it("has expected values for aiWorker", () => {
    expect(RATE_LIMITS.aiWorker).toEqual({ limit: 10, windowSeconds: 60 });
  });
});
