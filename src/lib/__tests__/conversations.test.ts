import { describe, expect, it } from "vitest";
import { isInTwilioCsWindow } from "@/lib/cs-window";

describe("isInTwilioCsWindow", () => {
  it("returns false for null last_inbound_at", () => {
    expect(isInTwilioCsWindow(null)).toBe(false);
  });

  it("returns false for an invalid date string", () => {
    expect(isInTwilioCsWindow("not-a-date")).toBe(false);
  });

  it("returns true for a recent inbound (now)", () => {
    expect(isInTwilioCsWindow(new Date().toISOString())).toBe(true);
  });

  it("returns true for an inbound 23 hours ago", () => {
    const ts = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    expect(isInTwilioCsWindow(ts)).toBe(true);
  });

  it("returns false for an inbound 25 hours ago", () => {
    const ts = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(isInTwilioCsWindow(ts)).toBe(false);
  });
});
