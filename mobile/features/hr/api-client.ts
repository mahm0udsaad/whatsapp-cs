import type {
  HrCompany,
  HrDevice,
  HrEmployee,
  HrMe,
  HrPresenceCheck,
  HrPunch,
  HrScan,
  HrToday,
  HrVerifiedIdentity,
} from "./types";
import { secureHrTokenStore, type HrTokenStore } from "./token-store";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HrApiLocale = "ar" | "en";

export interface HrDeviceRegistration {
  platform: "ios" | "android";
  model: string;
  os_version: string;
  public_key: string;
  key_algorithm: "ecdsa-p256-sha256";
  auth_method: HrScan["auth_method"];
  push_token?: string | null;
}

export interface HrActivationCompleteResponse {
  token: string;
  token_type: "Bearer";
  device: HrDevice;
  employee: HrEmployee;
  company: HrCompany;
  next_step: "first_scan";
}

export interface HrFirstScanResponse {
  device: HrDevice;
  place: HrPunch["place"];
  next_step: "admin_approval";
}

export interface HrPunchHistoryResponse {
  from: string;
  to: string;
  punches: HrPunch[];
}

interface ApiErrorBody {
  message?: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export class HrApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly errors: Record<string, string[]> = {},
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "HrApiError";
  }
}

export interface HrApiClientOptions {
  baseUrl?: string;
  locale?: HrApiLocale;
  tokenStore?: HrTokenStore;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(trimmed) && !/^http:\/\/localhost(?::\d+)?/i.test(trimmed)) {
    throw new Error("EXPO_PUBLIC_HR_API_URL must use HTTPS (or localhost for development)");
  }
  return trimmed;
}

function parseRetryAfter(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * Typed client for the published employee API. It deliberately does not retry writes:
 * attendance retries must reuse the same signed body and request id.
 */
export function createHrApiClient(options: HrApiClientOptions = {}) {
  const configuredUrl = options.baseUrl ?? process.env.EXPO_PUBLIC_HR_API_URL;
  if (!configuredUrl) throw new Error("EXPO_PUBLIC_HR_API_URL is not configured");
  const baseUrl = normalizeBaseUrl(configuredUrl);
  const tokenStore = options.tokenStore ?? secureHrTokenStore;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let locale: HrApiLocale = options.locale ?? "ar";

  async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const token = auth ? await tokenStore.get() : null;
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Accept-Language": locale,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody | T;
      if (!response.ok) {
        const error = body as ApiErrorBody;
        const code = error.code ?? `http_${response.status}`;
        if (response.status === 401 && (code === "unauthenticated" || code === "device_revoked")) {
          await tokenStore.clear();
        }
        throw new HrApiError(
          error.message ?? "The HR request failed.",
          response.status,
          code,
          error.errors ?? {},
          parseRetryAfter(response.headers.get("Retry-After")),
        );
      }
      return body as T;
    } catch (error) {
      if (error instanceof HrApiError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new HrApiError(
        aborted ? "The HR request timed out." : "Could not reach the HR service.",
        0,
        aborted ? "timeout" : "offline",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    setLocale(next: HrApiLocale) {
      locale = next;
    },
    verify(code: string) {
      return request<HrVerifiedIdentity>("/app/activation/verify", {
        method: "POST",
        body: JSON.stringify({ code }),
      }, false);
    },
    async complete(code: string, device: HrDeviceRegistration) {
      const result = await request<HrActivationCompleteResponse>("/app/activation/complete", {
        method: "POST",
        body: JSON.stringify({ code, ...device }),
      }, false);
      await tokenStore.set(result.token);
      return result;
    },
    firstScan(scan: HrScan) {
      return request<HrFirstScanResponse>("/app/activation/first-scan", {
        method: "POST",
        body: JSON.stringify(scan),
      });
    },
    me() {
      return request<HrMe>("/app/me");
    },
    today() {
      return request<HrToday>("/app/attendance/today");
    },
    punch(scan: HrScan) {
      return request<{ punch: HrPunch }>("/app/punches", {
        method: "POST",
        body: JSON.stringify(scan),
      });
    },
    history(from?: string, to?: string) {
      const query = new URLSearchParams();
      if (from) query.set("from", from);
      if (to) query.set("to", to);
      const suffix = query.toString() ? `?${query}` : "";
      return request<HrPunchHistoryResponse>(`/app/punches${suffix}`);
    },
    pending() {
      return request<{ presence_checks: HrPresenceCheck[]; server_time: string; server_time_ms: number }>(
        "/app/presence-checks/pending",
      );
    },
    confirmPresence(id: number, scan: HrScan) {
      return request<{ presence_check: HrPresenceCheck }>(`/app/presence-checks/${id}/confirm`, {
        method: "POST",
        body: JSON.stringify(scan),
      });
    },
    savePushToken(pushToken: string) {
      return request<{ saved: true }>("/app/device/push-token", {
        method: "POST",
        body: JSON.stringify({ push_token: pushToken }),
      });
    },
    async logout() {
      try {
        await request<{ logged_out: true }>("/app/logout", { method: "POST" });
      } finally {
        await tokenStore.clear();
      }
    },
  };
}

export type HrApiClient = ReturnType<typeof createHrApiClient>;

