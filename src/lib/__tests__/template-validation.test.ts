import { describe, expect, it } from "vitest";
import { validateTemplateContent } from "@/lib/template-validation";

const valid = {
  bodyTemplate: "مرحباً {{1}}، خصم {{2}} بانتظارك اليوم!",
  variables: ["customer_name", "discount"],
  sampleValues: ["عبدالله", "٥٠٪"],
};

describe("validateTemplateContent", () => {
  it("accepts a well-formed template", () => {
    expect(validateTemplateContent(valid)).toBeNull();
  });

  it("rejects an empty body", () => {
    expect(
      validateTemplateContent({ ...valid, bodyTemplate: "  " })
    ).toMatch(/نص الرسالة مطلوب/);
  });

  it("rejects a body over 1024 chars", () => {
    expect(
      validateTemplateContent({ ...valid, bodyTemplate: "ب".repeat(1025) })
    ).toMatch(/1024/);
  });

  it("rejects a body starting with a variable", () => {
    expect(
      validateTemplateContent({
        ...valid,
        bodyTemplate: "{{1}} مرحباً بك في مطعمنا",
        variables: ["name"],
        sampleValues: ["عبدالله"],
      })
    ).toMatch(/تبدأ/);
  });

  it("rejects a body ending with a variable", () => {
    expect(
      validateTemplateContent({
        ...valid,
        bodyTemplate: "خصم اليوم لعميلنا {{1}}",
        variables: ["name"],
        sampleValues: ["عبدالله"],
      })
    ).toMatch(/تنتهي/);
  });

  it("rejects adjacent variables", () => {
    expect(
      validateTemplateContent({
        ...valid,
        bodyTemplate: "مرحباً {{1}}{{2}} في مطعمنا",
      })
    ).toMatch(/متجاورين/);
  });

  it("rejects non-sequential variable numbering", () => {
    expect(
      validateTemplateContent({
        ...valid,
        bodyTemplate: "مرحباً {{1}}، كودك {{3}} جاهز الآن",
        variables: ["a", "b", "c"],
        sampleValues: ["x", "y", "z"],
      })
    ).toMatch(/متسلسلة/);
  });

  it("rejects placeholders beyond the declared variables", () => {
    expect(
      validateTemplateContent({
        ...valid,
        variables: ["name"],
        sampleValues: ["عبدالله"],
      })
    ).toMatch(/لا يطابق/);
  });

  it("rejects missing sample values", () => {
    expect(
      validateTemplateContent({ ...valid, sampleValues: ["عبدالله", " "] })
    ).toMatch(/قيمة واقعية/);
  });

  it("rejects a text header over 60 chars and headers with variables", () => {
    expect(
      validateTemplateContent({
        ...valid,
        headerType: "text",
        headerText: "ر".repeat(61),
      })
    ).toMatch(/60/);
    expect(
      validateTemplateContent({
        ...valid,
        headerType: "text",
        headerText: "عرض {{1}}",
      })
    ).toMatch(/الرأس/);
  });

  it("is not tripped up by /g regex state across calls", () => {
    // Two consecutive calls with variables in different fields — a stateful
    // global regex would give inconsistent results here.
    const withFooterVar = {
      ...valid,
      footerText: "تذييل {{1}}",
    };
    expect(validateTemplateContent(withFooterVar)).toMatch(/التذييل/);
    expect(validateTemplateContent(withFooterVar)).toMatch(/التذييل/);
  });

  it("rejects a footer over 60 chars", () => {
    expect(
      validateTemplateContent({ ...valid, footerText: "ت".repeat(61) })
    ).toMatch(/التذييل/);
  });

  it("rejects button text over 25 chars", () => {
    expect(
      validateTemplateContent({
        ...valid,
        buttons: [{ type: "QUICK_REPLY", title: "زر".repeat(20) }],
      })
    ).toMatch(/الزر/);
  });

  it("accepts a body with no variables at all", () => {
    expect(
      validateTemplateContent({
        bodyTemplate: "عرض اليوم: مشروب مجاني مع كل وجبة!",
      })
    ).toBeNull();
  });
});
