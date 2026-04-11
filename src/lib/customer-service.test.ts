import { describe, expect, it } from "vitest";
import {
  buildBusinessSupportContext,
  buildCustomerServiceSystemPrompt,
  buildCustomerServiceTemplate,
} from "@/lib/customer-service";

describe("customer-service helpers", () => {
  it("builds a business-neutral English customer service template", () => {
    const template = buildCustomerServiceTemplate("Acme Studio", "en");

    expect(template).toContain("Acme Studio");
    expect(template).toContain("products or services");
    expect(template).not.toContain("restaurant");
  });

  it("builds a business support context from available business fields", () => {
    const context = buildBusinessSupportContext({
      id: "1",
      owner_id: "owner-1",
      name: "Acme Studio",
      name_ar: null,
      logo_url: null,
      country: "EG",
      currency: "EGP",
      timezone: "Africa/Cairo",
      twilio_phone_number: null,
      twilio_account_sid: null,
      twilio_auth_token: null,
      digital_menu_url: "https://acme.test/catalog",
      website_url: "https://acme.test",
      telephone: "+20123456789",
      opening_hours: "9am-6pm",
      cuisine: "Wellness services",
      address: "Cairo",
      is_active: true,
      created_at: "",
      updated_at: "",
    });

    expect(context).toContain("Business name: Acme Studio");
    expect(context).toContain("Business type: Wellness services");
    expect(context).toContain("Opening hours: 9am-6pm");
  });

  it("assembles a full system prompt with business-specific context", () => {
    const prompt = buildCustomerServiceSystemPrompt({
      businessName: "Acme Studio",
      agentName: "Nora",
      customerName: "Layla",
      personality: "friendly",
      language: "en",
      baseInstructions: "Prioritize confirmed scheduling information.",
      businessContext: "Business type: Wellness services",
      ragContext: "Refunds are allowed within 24 hours.",
      menuContext: "Massage session: 500 EGP",
    });

    expect(prompt).toContain("Nora");
    expect(prompt).toContain("Acme Studio");
    expect(prompt).toContain("Layla");
    expect(prompt).toContain("Business Profile:");
    expect(prompt).toContain("Knowledge Base Context:");
    expect(prompt).toContain("Menu Context:");
    expect(prompt).toContain("Prioritize confirmed scheduling information.");
  });
});
