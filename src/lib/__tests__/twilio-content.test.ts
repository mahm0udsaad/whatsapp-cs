import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Use vi.hoisted to create mock functions and set env vars before module evaluation
const { mockCreate, mockFetch } = vi.hoisted(() => {
  // Set env vars at the earliest possible point
  process.env.TWILIO_ACCOUNT_SID = "ACtest123";
  process.env.TWILIO_AUTH_TOKEN = "test_token";
  process.env.TWILIO_PHONE_NUMBER = "+15551234567";

  return {
    mockCreate: vi.fn(),
    mockFetch: vi.fn(),
  };
});

// Mock global fetch
vi.stubGlobal("fetch", mockFetch);

// Mock the twilio client module
vi.mock("@/lib/twilio", () => ({
  getTwilioClient: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
  validateTwilioRequest: vi.fn(),
  sendWhatsAppMessage: vi.fn(),
  generateTwiMLResponse: vi.fn(),
  validateTwilioConfig: vi.fn(),
}));

import {
  createContentTemplate,
  submitForApproval,
  getApprovalStatus,
  sendTemplateMessage,
  deleteContentTemplate,
} from "@/lib/twilio-content";

const expectedAuth = `Basic ${Buffer.from("ACtest123:test_token").toString("base64")}`;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe("twilio-content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createContentTemplate", () => {
    it("sends correct POST to /Content and returns contentSid", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ sid: "HXABC123", date_created: "2025-01-01T00:00:00Z" })
      );

      const result = await createContentTemplate({
        friendlyName: "Order Update",
        language: "en",
        variables: { "1": "order_number" },
        types: { "twilio/text": { body: "Your order {{1}} is ready" } },
      });

      expect(result).toEqual({
        contentSid: "HXABC123",
        dateCreated: "2025-01-01T00:00:00Z",
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = (mockFetch as Mock).mock.calls[0];
      expect(url).toBe("https://content.twilio.com/v1/Content");
      expect(options.method).toBe("POST");
      expect(options.headers.Authorization).toBe(expectedAuth);
      expect(options.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(options.body);
      expect(body).toEqual({
        friendly_name: "Order Update",
        language: "en",
        variables: { "1": "order_number" },
        types: { "twilio/text": { body: "Your order {{1}} is ready" } },
      });
    });

    it("throws on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Invalid template body"),
      } as unknown as Response);

      await expect(
        createContentTemplate({
          friendlyName: "Bad Template",
          language: "en",
          variables: {},
          types: {},
        })
      ).rejects.toThrow("Twilio Content API error (400): Invalid template body");
    });
  });

  describe("submitForApproval", () => {
    it("sends correct POST to /Content/{sid}/ApprovalRequests/whatsapp", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ status: "pending" }));

      const result = await submitForApproval("HXABC123", {
        name: "order_update",
        category: "UTILITY",
      });

      expect(result).toEqual({ status: "pending" });

      const [url, options] = (mockFetch as Mock).mock.calls[0];
      expect(url).toBe(
        "https://content.twilio.com/v1/Content/HXABC123/ApprovalRequests/whatsapp"
      );
      expect(options.method).toBe("POST");
      expect(options.headers.Authorization).toBe(expectedAuth);

      const body = JSON.parse(options.body);
      expect(body).toEqual({ name: "order_update", category: "UTILITY" });
    });
  });

  describe("getApprovalStatus", () => {
    it("sends correct GET and returns status with rejectionReason", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ status: "rejected", rejection_reason: "Not compliant" })
      );

      const result = await getApprovalStatus("HXABC123");

      expect(result).toEqual({
        status: "rejected",
        rejectionReason: "Not compliant",
      });

      const [url, options] = (mockFetch as Mock).mock.calls[0];
      expect(url).toBe(
        "https://content.twilio.com/v1/Content/HXABC123/ApprovalRequests"
      );
      // GET is the default, so method should be undefined
      expect(options.method).toBeUndefined();
      expect(options.headers.Authorization).toBe(expectedAuth);
    });
  });

  describe("sendTemplateMessage", () => {
    it("calls twilio client messages.create with correct params", async () => {
      mockCreate.mockResolvedValueOnce({ sid: "SMXYZ789" });

      const result = await sendTemplateMessage({
        contentSid: "HXABC123",
        contentVariables: { "1": "John", "2": "42" },
        from: "+15551234567",
        to: "+15559876543",
        statusCallback: "https://example.com/status",
      });

      expect(result).toEqual({ messageSid: "SMXYZ789" });

      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockCreate).toHaveBeenCalledWith({
        contentSid: "HXABC123",
        contentVariables: JSON.stringify({ "1": "John", "2": "42" }),
        from: "whatsapp:+15551234567",
        to: "whatsapp:+15559876543",
        statusCallback: "https://example.com/status",
      });
    });
  });

  describe("deleteContentTemplate", () => {
    it("sends DELETE request successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as unknown as Response);

      await expect(deleteContentTemplate("HXABC123")).resolves.toBeUndefined();

      const [url, options] = (mockFetch as Mock).mock.calls[0];
      expect(url).toBe("https://content.twilio.com/v1/Content/HXABC123");
      expect(options.method).toBe("DELETE");
      expect(options.headers.Authorization).toBe(expectedAuth);
    });

    it("handles 404 gracefully without throwing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not found"),
      } as unknown as Response);

      await expect(deleteContentTemplate("HXGONE456")).resolves.toBeUndefined();
    });

    it("throws on non-404 errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal server error"),
      } as unknown as Response);

      await expect(deleteContentTemplate("HXFAIL789")).rejects.toThrow(
        "Twilio Content API delete error (500): Internal server error"
      );
    });
  });
});
