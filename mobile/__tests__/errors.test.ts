import {
  MSG_BAD_CREDENTIALS,
  MSG_OFFLINE,
  MSG_SERVER_DOWN,
  MSG_TIMEOUT,
  toUserMessage,
} from "../lib/errors";

function named(name: string, message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { name, ...extra });
}

describe("toUserMessage", () => {
  it("hides a serialized 504 Response from supabase-js", () => {
    const raw = JSON.stringify({
      type: "default",
      status: 504,
      ok: false,
      statusText: "",
      headers: { map: { "cf-ray": "abc" } },
      url: "https://x.supabase.co/auth/v1/token?grant_type=password",
    });
    expect(toUserMessage(named("AuthRetryableFetchError", raw, { status: 504 }))).toBe(
      MSG_SERVER_DOWN
    );
    expect(toUserMessage(named("AuthUnknownError", raw))).toBe(MSG_SERVER_DOWN);
    expect(toUserMessage(new Error(raw), "fallback")).toBe(MSG_SERVER_DOWN);
  });

  it("maps wrong password", () => {
    expect(
      toUserMessage(named("AuthApiError", "Invalid login credentials", { status: 400, code: "invalid_credentials" }))
    ).toBe(MSG_BAD_CREDENTIALS);
  });

  it("maps network and timeout failures", () => {
    expect(toUserMessage(new TypeError("Network request failed"))).toBe(MSG_OFFLINE);
    expect(toUserMessage(named("AuthRetryableFetchError", "{}", { status: 0 }))).toBe(MSG_OFFLINE);
    expect(toUserMessage(named("AbortError", "Aborted"))).toBe(MSG_TIMEOUT);
  });

  it("keeps readable messages and drops technical ones", () => {
    expect(toUserMessage(new Error("المحادثة محجوزة لموظف آخر"))).toBe("المحادثة محجوزة لموظف آخر");
    expect(toUserMessage(new Error("[409] Already claimed"))).toBe("Already claimed");
    expect(toUserMessage(new Error("Non-JSON response from /api/x (status 200)"), "fb")).toBe("fb");
    expect(toUserMessage(new Error("Cannot read property 'x' of undefined"), "fb")).toBe("fb");
    expect(toUserMessage({ foo: 1 }, "fb")).toBe("fb");
  });
});
