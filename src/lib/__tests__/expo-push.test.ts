import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const { mockFetch } = vi.hoisted(() => {
  return { mockFetch: vi.fn() };
});

vi.stubGlobal("fetch", mockFetch);

import { sendExpoPush, type ExpoPushMessage } from "@/lib/expo-push";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function validMessage(token: string, overrides: Partial<ExpoPushMessage> = {}): ExpoPushMessage {
  return {
    to: token,
    title: "t",
    body: "b",
    data: { foo: "bar" },
    priority: "high",
    channelId: "escalations",
    sound: "default",
    ...overrides,
  };
}

describe("sendExpoPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EXPO_ACCESS_TOKEN;
  });

  it("returns zero-everything for empty input without contacting Expo", async () => {
    const res = await sendExpoPush([]);
    expect(res).toEqual({ sent: 0, skipped: 0, invalidTokens: [], errors: [] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips messages with malformed tokens before calling Expo", async () => {
    const res = await sendExpoPush([
      validMessage("not-an-expo-token"),
      validMessage(""),
    ]);
    expect(res.skipped).toBe(2);
    expect(res.sent).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("POSTs valid messages to exp.host and counts ok tickets as sent", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { status: "ok", id: "abc" },
          { status: "ok", id: "def" },
        ],
      })
    );

    const msgs = [
      validMessage("ExponentPushToken[AAA]"),
      validMessage("ExponentPushToken[BBB]"),
    ];
    const res = await sendExpoPush(msgs);

    expect(res.sent).toBe(2);
    expect(res.invalidTokens).toEqual([]);
    expect(res.errors).toEqual([]);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = (mockFetch as Mock).mock.calls[0];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers.Authorization).toBeUndefined();

    const body = JSON.parse(options.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].to).toBe("ExponentPushToken[AAA]");
  });

  it("includes Authorization bearer header when EXPO_ACCESS_TOKEN is set", async () => {
    process.env.EXPO_ACCESS_TOKEN = "test-expo-key";
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ status: "ok", id: "abc" }] })
    );

    await sendExpoPush([validMessage("ExponentPushToken[AAA]")]);

    const [, options] = (mockFetch as Mock).mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer test-expo-key");
  });

  it("flags DeviceNotRegistered tokens as invalid", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { status: "ok", id: "1" },
          {
            status: "error",
            message: "not registered",
            details: { error: "DeviceNotRegistered" },
          },
        ],
      })
    );

    const res = await sendExpoPush([
      validMessage("ExponentPushToken[AAA]"),
      validMessage("ExponentPushToken[DEAD]"),
    ]);

    expect(res.sent).toBe(1);
    expect(res.invalidTokens).toEqual(["ExponentPushToken[DEAD]"]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].token).toBe("ExponentPushToken[DEAD]");
  });

  it("batches messages into groups of 100", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: Array.from({ length: 100 }, () => ({ status: "ok", id: "x" })),
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: Array.from({ length: 5 }, () => ({ status: "ok", id: "x" })),
        })
      );

    const msgs = Array.from({ length: 105 }, (_, i) =>
      validMessage(`ExponentPushToken[T${i}]`)
    );

    const res = await sendExpoPush(msgs);
    expect(res.sent).toBe(105);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse((mockFetch as Mock).mock.calls[0][1].body);
    const secondBody = JSON.parse((mockFetch as Mock).mock.calls[1][1].body);
    expect(firstBody).toHaveLength(100);
    expect(secondBody).toHaveLength(5);
  });

  it("records an error for each message in a non-2xx batch", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "nope" }, 500));

    const res = await sendExpoPush([
      validMessage("ExponentPushToken[AAA]"),
      validMessage("ExponentPushToken[BBB]"),
    ]);

    expect(res.sent).toBe(0);
    expect(res.errors).toHaveLength(2);
    expect(res.errors[0].message).toMatch(/HTTP 500/);
  });

  it("records timeout errors when the request aborts", async () => {
    mockFetch.mockImplementationOnce(
      (_url: string, options: { signal: AbortSignal }) => {
        return new Promise((_, reject) => {
          options.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }
    );

    vi.useFakeTimers();
    const p = sendExpoPush([validMessage("ExponentPushToken[AAA]")]);
    await vi.advanceTimersByTimeAsync(11_000);
    const res = await p;
    vi.useRealTimers();

    expect(res.sent).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].message).toMatch(/Timeout/);
  });
});
