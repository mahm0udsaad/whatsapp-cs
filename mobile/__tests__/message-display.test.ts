import { displayMessageText } from "../lib/message-display";

describe("displayMessageText (interactive taps)", () => {
  it("returns plain content unchanged", () => {
    expect(displayMessageText({ content: "مرحبا" })).toBe("مرحبا");
  });

  it("shows the tap title instead of the raw token", () => {
    expect(
      displayMessageText({
        content: "[user_action:e_store]",
        metadata: { tap: { id: "e_store", title: "المتجر الإلكتروني" } },
      })
    ).toBe("المتجر الإلكتروني");
  });

  it("falls back to raw_body when title is missing", () => {
    expect(
      displayMessageText({
        content: "[user_action:e_store]",
        metadata: { tap: { id: "e_store", title: null, raw_body: "المتجر" } },
      })
    ).toBe("المتجر");
  });

  it("strips the token when no metadata, keeping surrounding text", () => {
    expect(
      displayMessageText({ content: "أريد الحجز [user_action:book]" })
    ).toBe("أريد الحجز");
  });

  it("prettifies the action id when nothing else is available", () => {
    expect(displayMessageText({ content: "[user_action:e_store]" })).toBe(
      "e store"
    );
  });

  it("handles null content", () => {
    expect(displayMessageText({ content: null })).toBe("");
  });
});
