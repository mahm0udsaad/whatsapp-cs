import { describe, it, expect } from "vitest";
import {
  findUnansweredCustomerMessageId,
  type CatchUpMessage,
} from "../catchup-decision";

// Helper: build a message with an incrementing-ish timestamp.
const at = (n: number) => `2026-06-21T10:0${n}:00.000Z`;

describe("findUnansweredCustomerMessageId (return-to-bot)", () => {
  it("returns null when there are no customer messages", () => {
    const msgs: CatchUpMessage[] = [
      { id: "a1", role: "agent", created_at: at(1) },
      { id: "s1", role: "system", created_at: at(2) },
    ];
    expect(findUnansweredCustomerMessageId(msgs)).toBeNull();
  });

  it("returns the customer message id when nobody replied after it", () => {
    const msgs: CatchUpMessage[] = [
      { id: "c1", role: "customer", created_at: at(3) },
      { id: "a1", role: "agent", created_at: at(1) }, // older reply, doesn't count
    ];
    expect(findUnansweredCustomerMessageId(msgs)).toBe("c1");
  });

  it("returns null when a human agent replied after the last customer message", () => {
    const msgs: CatchUpMessage[] = [
      { id: "c1", role: "customer", created_at: at(1) },
      { id: "a1", role: "agent", created_at: at(2) },
    ];
    expect(findUnansweredCustomerMessageId(msgs)).toBeNull();
  });

  it("returns null when the bot (assistant) already answered the last customer message", () => {
    const msgs: CatchUpMessage[] = [
      { id: "c1", role: "customer", created_at: at(1) },
      { id: "b1", role: "assistant", created_at: at(2) },
    ];
    expect(findUnansweredCustomerMessageId(msgs)).toBeNull();
  });

  it("answers the NEWER customer message even if an earlier one was answered", () => {
    const msgs: CatchUpMessage[] = [
      { id: "c1", role: "customer", created_at: at(1) },
      { id: "a1", role: "agent", created_at: at(2) },
      { id: "c2", role: "customer", created_at: at(3) }, // unanswered follow-up
    ];
    expect(findUnansweredCustomerMessageId(msgs)).toBe("c2");
  });

  it("ignores non-reply rows (e.g. system) after the customer message", () => {
    const msgs: CatchUpMessage[] = [
      { id: "c1", role: "customer", created_at: at(1) },
      { id: "s1", role: "system", created_at: at(2) }, // not a reply
    ];
    expect(findUnansweredCustomerMessageId(msgs)).toBe("c1");
  });

  it("is order-independent (works on desc-sorted input from the query)", () => {
    const desc: CatchUpMessage[] = [
      { id: "c2", role: "customer", created_at: at(3) },
      { id: "a1", role: "agent", created_at: at(2) },
      { id: "c1", role: "customer", created_at: at(1) },
    ];
    expect(findUnansweredCustomerMessageId(desc)).toBe("c2");
  });
});
