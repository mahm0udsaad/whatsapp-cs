import { describe, expect, it } from "vitest";
import {
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

describe("renderTemplateBody", () => {
  it("substitutes known placeholders and keeps unknown ones", () => {
    expect(renderTemplateBody("Hi {{1}}, {{2}}", { "1": "Ali" })).toBe("Hi Ali, {{2}}");
  });
});
