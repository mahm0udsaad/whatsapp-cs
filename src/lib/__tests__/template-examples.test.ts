import { describe, expect, it } from "vitest";
import {
  TEMPLATE_EXAMPLES,
  findTemplateExample,
} from "@/lib/template-examples";

describe("TEMPLATE_EXAMPLES library", () => {
  it("ships at least the six expected curated examples", () => {
    const expected = [
      "promotion-discount",
      "welcome-back",
      "order-status-update",
      "event-invite",
      "feedback-request",
      "otp-auth-code",
    ];
    for (const slug of expected) {
      expect(
        TEMPLATE_EXAMPLES.find((e) => e.slug === slug),
        `missing example: ${slug}`
      ).toBeTruthy();
    }
  });

  it("each example has a non-empty body and a valid header type", () => {
    for (const ex of TEMPLATE_EXAMPLES) {
      expect(ex.preview.body_template.trim().length, ex.slug).toBeGreaterThan(0);
      expect(["none", "text", "image"]).toContain(ex.preview.header_type);
      if (ex.preview.header_type === "text") {
        expect(ex.preview.header_text, ex.slug).toBeTruthy();
      }
      if (ex.preview.header_type === "image") {
        expect(ex.preview.image_prompt, ex.slug).toBeTruthy();
      }
    }
  });

  it("variables count matches the highest {{N}} placeholder used in the body", () => {
    for (const ex of TEMPLATE_EXAMPLES) {
      const matches = ex.preview.body_template.match(/{{(\d+)}}/g) ?? [];
      const used = new Set(
        matches.map((m) => Number(m.replace(/[{}]/g, "")))
      );
      const max = used.size > 0 ? Math.max(...used) : 0;
      // The variable list must cover every placeholder index used.
      expect(ex.variables.length, ex.slug).toBeGreaterThanOrEqual(max);
    }
  });

  it("button counts respect WhatsApp limits (max 3 quick replies, max 2 URL)", () => {
    for (const ex of TEMPLATE_EXAMPLES) {
      const buttons = ex.preview.buttons ?? [];
      const quickReplies = buttons.filter((b) => b.type === "QUICK_REPLY");
      const urls = buttons.filter((b) => b.type === "URL");
      expect(quickReplies.length, ex.slug).toBeLessThanOrEqual(3);
      expect(urls.length, ex.slug).toBeLessThanOrEqual(2);
    }
  });

  it("findTemplateExample returns the matching example or undefined", () => {
    expect(findTemplateExample("promotion-discount")?.slug).toBe(
      "promotion-discount"
    );
    expect(findTemplateExample("does-not-exist")).toBeUndefined();
  });
});
