import { describe, expect, it } from "vitest";
import {
  recipientNameSlot,
  renderTemplateBody,
  resolveTemplateVariables,
  templatePlaceholderIndexes,
} from "@/lib/template-conversation";

describe("templatePlaceholderIndexes", () => {
  it("returns distinct sorted indexes", () => {
    expect(templatePlaceholderIndexes("{{2}} hi {{1}} {{2}} {{ 3 }}")).toEqual([1, 2, 3]);
  });

  it("handles empty bodies", () => {
    expect(templatePlaceholderIndexes(null)).toEqual([]);
    expect(templatePlaceholderIndexes("no vars")).toEqual([]);
  });
});

describe("resolveTemplateVariables", () => {
  const body = "مرحبا {{1}}، خصم {{2}}٪ بكود {{3}}";

  it("uses provided values", () => {
    const r = resolveTemplateVariables({
      body,
      language: "ar",
      provided: { "1": " أحمد ", "2": "20", "3": "SAVE" },
      customerName: null,
    });
    expect(r).toEqual({ ok: true, variables: { "1": "أحمد", "2": "20", "3": "SAVE" } });
  });

  it("falls back {{1}} to customer name then generic greeting", () => {
    const withName = resolveTemplateVariables({
      body,
      language: "ar",
      provided: { "2": "20", "3": "SAVE" },
      customerName: "سارة",
    });
    expect(withName.ok && withName.variables["1"]).toBe("سارة");

    const noName = resolveTemplateVariables({
      body: "Hi {{1}}",
      language: "en",
      provided: {},
      customerName: "  ",
    });
    expect(noName.ok && noName.variables["1"]).toBe("Dear customer");
  });

  it("reports missing non-name variables", () => {
    const r = resolveTemplateVariables({
      body,
      language: "ar",
      provided: { "2": "" },
      customerName: "x",
    });
    expect(r).toEqual({ ok: false, missing: [2, 3] });
  });

  it("ignores extra provided keys", () => {
    const r = resolveTemplateVariables({
      body: "Hello",
      language: "en",
      provided: { "5": "x" },
      customerName: null,
    });
    expect(r).toEqual({ ok: true, variables: {} });
  });
});

describe("label-aware resolution", () => {
  const outreach = "هلا، {{1}} من نحجز هب. نخلي {{2}} يستقبل حجوزات، شوفوها: {{3}} الآن";
  const labels = ["agent_name", "salon_name", "link"];

  it("fills the agent slot with the sender and the salon slot with the customer", () => {
    const r = resolveTemplateVariables({
      body: outreach,
      language: "ar",
      provided: { "3": "https://nehgzbot.com" },
      customerName: "صالون لمسة",
      labels,
      senderName: "سارة",
    });
    expect(r).toEqual({
      ok: true,
      variables: { "1": "سارة", "2": "صالون لمسة", "3": "https://nehgzbot.com" },
    });
  });

  it("never puts the generic greeting into a salon-name slot", () => {
    const r = resolveTemplateVariables({
      body: outreach,
      language: "ar",
      provided: { "3": "x" },
      customerName: null,
      labels,
      senderName: null,
    });
    expect(r).toEqual({ ok: false, missing: [1, 2] });
  });

  it("explicit values override auto-fill", () => {
    const r = resolveTemplateVariables({
      body: outreach,
      language: "ar",
      provided: { "1": "نورة", "2": "صالون ب", "3": "x" },
      customerName: "صالون أ",
      labels,
      senderName: "سارة",
    });
    expect(r.ok && r.variables).toEqual({ "1": "نورة", "2": "صالون ب", "3": "x" });
  });
});

describe("recipientNameSlot", () => {
  it("prefers a business label, skips an agent-name {{1}}", () => {
    expect(recipientNameSlot(["agent_name", "salon_name"])).toBe(2);
    expect(recipientNameSlot(["agent_name", "link"])).toBeNull();
    expect(recipientNameSlot(["customer_name", "discount"])).toBe(1);
    expect(recipientNameSlot(null)).toBe(1);
  });
});

describe("renderTemplateBody", () => {
  it("substitutes known placeholders and keeps unknown ones", () => {
    expect(renderTemplateBody("Hi {{1}}, {{2}}", { "1": "Ali" })).toBe("Hi Ali, {{2}}");
  });
});
