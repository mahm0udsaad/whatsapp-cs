import { createHrApiClient, HrApiError, type HrDeviceRegistration } from "../features/hr/api-client";
import type { HrTokenStore } from "../features/hr/token-store";

function memoryTokenStore(initial: string | null = null) {
  let value = initial;
  const store: HrTokenStore = {
    get: jest.fn(async () => value),
    set: jest.fn(async (token) => { value = token; }),
    clear: jest.fn(async () => { value = null; }),
  };
  return { store, value: () => value };
}

function response(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

const registration: HrDeviceRegistration = {
  platform: "ios",
  model: "iPhone",
  os_version: "26.1",
  public_key: "PUBLIC-KEY",
  key_algorithm: "ecdsa-p256-sha256",
  auth_method: "biometric_bound",
  push_token: null,
};

describe("published HR API client", () => {
  it("verifies activation without sending an employee bearer token", async () => {
    const tokens = memoryTokenStore("old-token");
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => response({
      employee: { id: 42 }, company: { name: "Company" }, expires_at: "2026-11-10T00:00:00Z",
    }));
    const client = createHrApiClient({ baseUrl: "https://nehgzhub-hr.com/api/v1/", tokenStore: tokens.store, fetchImpl });
    await client.verify("K7QM-4XHT");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://nehgzhub-hr.com/api/v1/app/activation/verify");
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init?.body).toBe(JSON.stringify({ code: "K7QM-4XHT" }));
  });

  it("stores the phone token only after successful activation", async () => {
    const tokens = memoryTokenStore();
    const fetchImpl = jest.fn(async (_url: string, _init?: RequestInit) => response({ token: "phone-token", token_type: "Bearer", next_step: "first_scan" }, 201));
    const client = createHrApiClient({ baseUrl: "https://nehgzhub-hr.com/api/v1", tokenStore: tokens.store, fetchImpl });
    await client.complete("K7QM-4XHT", registration);
    expect(tokens.value()).toBe("phone-token");
    const sent = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(sent).toMatchObject({ code: "K7QM-4XHT", key_algorithm: "ecdsa-p256-sha256" });
  });

  it("adds the secure token to authenticated requests", async () => {
    const tokens = memoryTokenStore("phone-token");
    const fetchImpl = jest.fn(async (_url: string, _init?: RequestInit) => response({ activation_status: "active" }));
    const client = createHrApiClient({ baseUrl: "https://nehgzhub-hr.com/api/v1", tokenStore: tokens.store, fetchImpl });
    await client.me();
    expect((fetchImpl.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer phone-token");
  });

  it("preserves structured errors and clears revoked credentials", async () => {
    const tokens = memoryTokenStore("revoked-token");
    const fetchImpl = jest.fn(async () => response({ message: "Phone revoked", code: "device_revoked", errors: {} }, 401));
    const client = createHrApiClient({ baseUrl: "https://nehgzhub-hr.com/api/v1", tokenStore: tokens.store, fetchImpl });
    await expect(client.me()).rejects.toMatchObject({ name: "HrApiError", status: 401, code: "device_revoked" });
    expect(tokens.value()).toBeNull();
  });

  it("does not automatically retry a signed attendance write", async () => {
    const tokens = memoryTokenStore("phone-token");
    const fetchImpl = jest.fn(async () => { throw new TypeError("network down"); });
    const client = createHrApiClient({ baseUrl: "https://nehgzhub-hr.com/api/v1", tokenStore: tokens.store, fetchImpl });
    await expect(client.punch({
      qr_payload: "v1.door.step.code",
      client_request_id: "same-request-id",
      auth_method: "biometric_bound",
      signature: "signature",
    })).rejects.toBeInstanceOf(HrApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reads Retry-After without retrying", async () => {
    const fetchImpl = jest.fn(async () => response({ message: "Wait", code: "rate_limited", errors: {} }, 429, { "Retry-After": "30" }));
    const client = createHrApiClient({ baseUrl: "https://nehgzhub-hr.com/api/v1", tokenStore: memoryTokenStore().store, fetchImpl });
    await expect(client.verify("ABCD-EFGH")).rejects.toMatchObject({ code: "rate_limited", retryAfter: 30 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

