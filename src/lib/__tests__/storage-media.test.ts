import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Set env + hoisted fetch mock before module evaluation.
const { mockFetch } = vi.hoisted(() => {
  process.env.TWILIO_ACCOUNT_SID = "ACtest123";
  process.env.TWILIO_AUTH_TOKEN = "test_token";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test_service_role";
  return { mockFetch: vi.fn() };
});

vi.stubGlobal("fetch", mockFetch);

// Stub the admin client so we don't hit the real Supabase during unit tests.
vi.mock("@/lib/supabase/admin", () => ({
  adminSupabaseClient: {
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ data: {}, error: null })),
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: "https://signed.example" },
          error: null,
        })),
      }),
    },
  },
}));

import {
  downloadTwilioMedia,
  extFromContentType,
  messageTypeFromContentType,
  placeholderCaptionFor,
  MAX_INBOUND_MEDIA_BYTES,
  buildMediaStoragePath,
  parseMediaStoragePath,
} from "@/lib/storage-media";

function okResponse(buf: ArrayBuffer, contentType = "image/jpeg"): Response {
  const headers = new Map<string, string>([
    ["content-type", contentType],
    ["content-length", String(buf.byteLength)],
  ]);
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: {
      get: (k: string) => headers.get(k.toLowerCase()) ?? null,
    },
    arrayBuffer: async () => buf,
  } as unknown as Response;
}

describe("storage-media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("content-type helpers", () => {
    it("maps common content-types to extensions", () => {
      expect(extFromContentType("image/jpeg")).toBe("jpg");
      expect(extFromContentType("audio/ogg")).toBe("ogg");
      expect(extFromContentType("application/pdf")).toBe("pdf");
      expect(extFromContentType("video/mp4")).toBe("mp4");
      expect(extFromContentType("weird/thing")).toBe("bin");
    });

    it("classifies message_type from content-type", () => {
      expect(messageTypeFromContentType("image/png")).toBe("image");
      expect(messageTypeFromContentType("audio/ogg")).toBe("voice");
      expect(messageTypeFromContentType("audio/mpeg")).toBe("audio");
      expect(messageTypeFromContentType("video/mp4")).toBe("video");
      expect(messageTypeFromContentType("application/pdf")).toBe("document");
      expect(messageTypeFromContentType("application/zip")).toBe("file");
    });

    it("returns Arabic placeholder captions", () => {
      expect(placeholderCaptionFor("image")).toContain("صورة");
      expect(placeholderCaptionFor("voice")).toContain("ملف صوتي");
      expect(placeholderCaptionFor("video")).toContain("فيديو");
      expect(placeholderCaptionFor("document")).toContain("مستند");
      expect(placeholderCaptionFor("file")).toContain("ملف");
    });
  });

  describe("path helpers", () => {
    it("builds tenant-scoped storage paths", () => {
      const path = buildMediaStoragePath({
        restaurantId: "00000000-0000-0000-0000-000000000001",
        conversationId: "00000000-0000-0000-0000-000000000002",
        contentType: "image/jpeg",
      });
      expect(path).toMatch(
        /^00000000-0000-0000-0000-000000000001\/00000000-0000-0000-0000-000000000002\/\d{4}\/\d{2}\/[a-z0-9]+\.jpg$/
      );
    });

    it("parses restaurant + conversation from a path", () => {
      const parsed = parseMediaStoragePath(
        "r1/c1/2026/04/abc.jpg"
      );
      expect(parsed.restaurantId).toBe("r1");
      expect(parsed.conversationId).toBe("c1");
    });
  });

  describe("downloadTwilioMedia 20MB cap", () => {
    it("succeeds on a small buffer", async () => {
      const small = new Uint8Array(1024).buffer;
      mockFetch.mockResolvedValueOnce(okResponse(small, "image/jpeg"));

      const result = await downloadTwilioMedia("https://twilio/media/1");
      expect(result.sizeBytes).toBe(1024);
      expect(result.contentType).toBe("image/jpeg");
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it("sends Basic auth with Twilio credentials", async () => {
      const buf = new Uint8Array(8).buffer;
      mockFetch.mockResolvedValueOnce(okResponse(buf));

      await downloadTwilioMedia("https://twilio/media/1");
      const [, options] = (mockFetch as Mock).mock.calls[0];
      const expectedAuth = `Basic ${Buffer.from("ACtest123:test_token").toString(
        "base64"
      )}`;
      expect(options.headers.Authorization).toBe(expectedAuth);
    });

    it("rejects when declared content-length exceeds the 20MB cap", async () => {
      const overCap = MAX_INBOUND_MEDIA_BYTES + 1;
      const headers = new Map<string, string>([
        ["content-type", "video/mp4"],
        ["content-length", String(overCap)],
      ]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: (k: string) => headers.get(k.toLowerCase()) ?? null,
        },
        arrayBuffer: async () => new Uint8Array(overCap).buffer,
      } as unknown as Response);

      await expect(
        downloadTwilioMedia("https://twilio/media/big")
      ).rejects.toThrow(/too large/i);
    });

    it("rejects when response body size exceeds the 20MB cap (no content-length)", async () => {
      // No content-length header, but the actual body is over the cap.
      const overCap = MAX_INBOUND_MEDIA_BYTES + 1;
      const headers = new Map<string, string>([
        ["content-type", "video/mp4"],
      ]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: (k: string) => headers.get(k.toLowerCase()) ?? null,
        },
        arrayBuffer: async () => new Uint8Array(overCap).buffer,
      } as unknown as Response);

      await expect(
        downloadTwilioMedia("https://twilio/media/big")
      ).rejects.toThrow(/too large/i);
    });

    it("throws on non-2xx", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array(0).buffer,
      } as unknown as Response);

      await expect(
        downloadTwilioMedia("https://twilio/missing")
      ).rejects.toThrow(/404/);
    });
  });
});
