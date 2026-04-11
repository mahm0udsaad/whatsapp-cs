import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so the mock fns and env vars are set before any vi.mock factory runs.
// vi.mock is hoisted above vi.stubEnv, so we set process.env directly in hoisted block.
const { mockValidateRequest, mockMessagesCreate } = vi.hoisted(() => {
  process.env.TWILIO_ACCOUNT_SID = "ACtest123";
  process.env.TWILIO_AUTH_TOKEN = "test_auth_token";
  process.env.TWILIO_PHONE_NUMBER = "+15551234567";
  return {
    mockValidateRequest: vi.fn(),
    mockMessagesCreate: vi.fn(),
  };
});

vi.mock("twilio", () => {
  const fn = vi.fn(() => ({ messages: { create: mockMessagesCreate } })) as unknown as {
    (...args: unknown[]): { messages: { create: typeof mockMessagesCreate } };
    validateRequest: typeof mockValidateRequest;
  };
  fn.validateRequest = mockValidateRequest;
  return { default: fn };
});

import {
  validateTwilioRequest,
  sendWhatsAppMessage,
  generateTwiMLResponse,
} from "@/lib/twilio";

describe("validateTwilioRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when twilio.validateRequest returns true", () => {
    mockValidateRequest.mockReturnValue(true);

    const result = validateTwilioRequest(
      "https://example.com/webhook",
      { Body: "hello" },
      "valid-signature"
    );

    expect(result).toBe(true);
    expect(mockValidateRequest).toHaveBeenCalledWith(
      "test_auth_token",
      "valid-signature",
      "https://example.com/webhook",
      { Body: "hello" }
    );
  });

  it("returns false when twilio.validateRequest returns false", () => {
    mockValidateRequest.mockReturnValue(false);

    const result = validateTwilioRequest(
      "https://example.com/webhook",
      { Body: "hello" },
      "invalid-signature"
    );

    expect(result).toBe(false);
  });

  it("returns false when twilio.validateRequest throws", () => {
    mockValidateRequest.mockImplementation(() => {
      throw new Error("crypto failure");
    });

    const result = validateTwilioRequest(
      "https://example.com/webhook",
      { Body: "hello" },
      "bad-signature"
    );

    expect(result).toBe(false);
  });
});

describe("sendWhatsAppMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls messages.create with correct whatsapp: prefixed numbers", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM123" });

    const sid = await sendWhatsAppMessage("+14155551234", "Hello there");

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "whatsapp:+15551234567",
        to: "whatsapp:+14155551234",
        body: "Hello there",
      })
    );
    expect(sid).toBe("SM123");
  });

  it("includes mediaUrl when provided", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM456" });

    await sendWhatsAppMessage("+14155551234", "See image", {
      mediaUrl: "https://example.com/image.png",
    });

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaUrl: ["https://example.com/image.png"],
      })
    );
  });

  it("includes statusCallback when provided", async () => {
    mockMessagesCreate.mockResolvedValue({ sid: "SM789" });

    await sendWhatsAppMessage("+14155551234", "Track me", {
      statusCallback: "https://example.com/status",
    });

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCallback: "https://example.com/status",
      })
    );
  });
});

describe("generateTwiMLResponse", () => {
  it("returns valid XML with the message content", () => {
    const result = generateTwiMLResponse("Hello World");

    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain("<Response>");
    expect(result).toContain("<Message>Hello World</Message>");
    expect(result).toContain("</Response>");
  });

  it("escapes special XML characters (&, <, >, \", ')", () => {
    const result = generateTwiMLResponse(`Tom & Jerry <said> "it's" cool`);

    expect(result).toContain(
      "Tom &amp; Jerry &lt;said&gt; &quot;it&apos;s&quot; cool"
    );
    // Must not contain raw unescaped & (bare & not followed by amp;/lt;/gt;/quot;/apos;)
    const messageContent = result.match(/<Message>(.*)<\/Message>/)?.[1] ?? "";
    expect(messageContent).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    // Must not contain raw < or > (other than the XML tags)
    expect(messageContent).not.toContain("<");
    expect(messageContent).not.toContain(">");
  });
});
