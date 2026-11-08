import { createScenario } from "../features/hr/fixtures";
import { createDemoScan, createHrMockService, deriveHistory, derivePending, HrError } from "../features/hr/mock-service";
import { hrBlockingCode, hrErrorCode, hrErrorView } from "../features/hr/errors";
import { historyRange, historySummary } from "../features/hr/screens/history";
import { advanceHrClock, getHrDemoState, setHrScenario, triggerHrPresence } from "../features/hr/store";
import type { HrErrorCode, HrScenario } from "../features/hr/types";

jest.mock("expo-router", () => ({ router: {}, Redirect: () => null, Stack: { Screen: () => null }, useLocalSearchParams: () => ({}), useFocusEffect: () => undefined }));
jest.mock("../lib/session-store", () => ({ useSessionStore: Object.assign(() => undefined, { subscribe: () => () => undefined }) }));

const ALL_CODES: HrErrorCode[] = ["offline", "timeout_after_punch", "qr_expired", "qr_invalid", "duplicate_punch", "signature_invalid", "revoked", "device_revoked", "attendance_not_tracked", "employee_inactive", "subscription_inactive", "activation_code_invalid", "activation_code_expired", "activation_code_used", "server_error", "rate_limited", "validation_failed", "device_not_approved", "unauthenticated", "presence_check_expired", "not_found"];

describe("HR history presets", () => {
  it("builds week, month and previous-month ranges from the company work date", () => {
    expect(historyRange("week", "2026-11-02")).toEqual({ from: "2026-10-26", to: "2026-11-02" });
    expect(historyRange("month", "2026-11-02")).toEqual({ from: "2026-11-01", to: "2026-11-02" });
    expect(historyRange("previous", "2026-11-02")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(historyRange("previous", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("summarises present days, late minutes and missing scans", () => {
    const state = createScenario("on_duty", undefined, 0);
    const { from, to } = historyRange("week", "2026-11-02");
    const days = deriveHistory(state, state.clockBase).filter((d) => d.work_date >= from && d.work_date <= to);
    expect(historySummary(days)).toEqual({ present: 4, lateMinutes: 11, missing: 1 });
  });
});

describe("HR error presentation", () => {
  it.each(ALL_CODES)("has bilingual copy and a recovery for %s", (code) => {
    const view = hrErrorView(code);
    expect(view.title.every(Boolean)).toBe(true);
    expect(view.body.every(Boolean)).toBe(true);
    expect(view.primary.recovery).toBeTruthy();
  });

  it("retries ambiguous failures with the same body and rescans QR problems", () => {
    expect(hrErrorView("offline").primary.recovery).toBe("retry_same");
    expect(hrErrorView("timeout_after_punch").primary.recovery).toBe("retry_same");
    expect(hrErrorView("qr_expired").primary.recovery).toBe("rescan");
    expect(hrErrorView("device_revoked").primary.recovery).toBe("reactivate");
  });

  it("dispatches by structured code, not message", () => {
    expect(hrErrorCode(new HrError("qr_expired", "en"))).toBe("qr_expired");
    expect(hrErrorCode(new Error("qr_expired"))).toBe("server_error");
  });

  it.each([["revoked", "device_revoked"], ["employee_inactive", "employee_inactive"], ["on_duty", null]] as [HrScenario, HrErrorCode | null][])("flags blocked employees up front: %s", (scenario, expected) => {
    expect(hrBlockingCode(createScenario(scenario, undefined, 0))).toBe(expected);
  });
});

describe("HR demo controls", () => {
  it("sends a presence check that expires after the company window", () => {
    setHrScenario("t1", "active");
    const id = triggerHrPresence("t1");
    const state = getHrDemoState("t1");
    const now = state.clockBase + (Date.now() - state.clockStartedAt);
    expect(derivePending(state, now).map((p) => p.id)).toEqual([id]);
    expect(derivePending(state, now + 10 * 60_000 + 1000)).toEqual([]);
    expect(state.punches).toHaveLength(0);
  });

  it("advances the demo clock without touching attendance", () => {
    setHrScenario("t2", "on_duty");
    const before = getHrDemoState("t2");
    advanceHrClock("t2", 5 * 60_000);
    expect(getHrDemoState("t2").clockBase - before.clockBase).toBe(300_000);
    expect(getHrDemoState("t2").punches).toEqual(before.punches);
  });

  it("lets a revoked phone register again with a new code", async () => {
    let state = createScenario("revoked", undefined, 0);
    const service = createHrMockService({ read: () => state, write: (next) => { state = next; }, clock: () => state.clockBase, latencyMs: 0 });
    await expect(service.punch(createDemoScan())).rejects.toMatchObject({ code: "device_revoked" });
    await service.verify("K7QM-4XHT");
    await service.complete("K7QM4XHT");
    expect(state.activationStatus).toBe("pending_first_scan");
  });
});
