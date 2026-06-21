import { describe, it, expect } from "vitest";
import {
  isAiWithinSchedule,
  parseTimeToMinutes,
  isWeekend,
} from "../ai-schedule";

// A fixed UTC instant we can reason about in Asia/Riyadh (UTC+3, no DST).
//   2026-06-22T07:00:00Z  -> Mon 10:00 Riyadh
//   2026-06-22T20:00:00Z  -> Mon 23:00 Riyadh
//   2026-06-19T07:00:00Z  -> Fri 10:00 Riyadh
//   2026-06-19T22:00:00Z  -> Sat 01:00 Riyadh
const MON_10_RIYADH = new Date("2026-06-22T07:00:00Z");
const MON_23_RIYADH = new Date("2026-06-22T20:00:00Z");
const FRI_10_RIYADH = new Date("2026-06-19T07:00:00Z");
const SAT_01_RIYADH = new Date("2026-06-19T22:00:00Z");

describe("parseTimeToMinutes", () => {
  it("parses HH:MM", () => {
    expect(parseTimeToMinutes("09:30")).toBe(9 * 60 + 30);
  });
  it("parses HH:MM:SS (Postgres time)", () => {
    expect(parseTimeToMinutes("22:00:00")).toBe(22 * 60);
  });
  it("rejects garbage", () => {
    expect(parseTimeToMinutes("nope")).toBeNull();
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes(null)).toBeNull();
    expect(parseTimeToMinutes("25:00")).toBeNull();
  });
});

describe("isWeekend (Saudi Fri/Sat)", () => {
  it("flags Friday and Saturday", () => {
    expect(isWeekend(5)).toBe(true);
    expect(isWeekend(6)).toBe(true);
  });
  it("does not flag weekdays/Sunday", () => {
    expect(isWeekend(0)).toBe(false);
    expect(isWeekend(4)).toBe(false);
  });
});

describe("isAiWithinSchedule", () => {
  it("always on when scheduling disabled", () => {
    expect(isAiWithinSchedule({ ai_schedule_enabled: false }, MON_23_RIYADH)).toBe(true);
    expect(isAiWithinSchedule(null, MON_23_RIYADH)).toBe(true);
    expect(isAiWithinSchedule(undefined, MON_23_RIYADH)).toBe(true);
  });

  const base = {
    ai_schedule_enabled: true,
    ai_schedule_start: "09:00",
    ai_schedule_end: "22:00",
    ai_schedule_timezone: "Asia/Riyadh",
  };

  it("inside daily window → allowed", () => {
    expect(isAiWithinSchedule(base, MON_10_RIYADH)).toBe(true);
  });

  it("outside daily window → blocked", () => {
    expect(isAiWithinSchedule(base, MON_23_RIYADH)).toBe(false);
  });

  it("weekend without 24h flag still respects daily window", () => {
    // Sat 01:00 is outside 09:00–22:00.
    expect(
      isAiWithinSchedule({ ...base, ai_schedule_weekend_24h: false }, SAT_01_RIYADH)
    ).toBe(false);
  });

  it("weekend 24h flag → allowed all day Fri/Sat", () => {
    expect(
      isAiWithinSchedule({ ...base, ai_schedule_weekend_24h: true }, SAT_01_RIYADH)
    ).toBe(true);
    expect(
      isAiWithinSchedule({ ...base, ai_schedule_weekend_24h: true }, FRI_10_RIYADH)
    ).toBe(true);
  });

  it("weekend 24h flag does NOT affect weekdays", () => {
    expect(
      isAiWithinSchedule({ ...base, ai_schedule_weekend_24h: true }, MON_23_RIYADH)
    ).toBe(false);
  });

  it("supports overnight windows (22:00–06:00)", () => {
    const overnight = { ...base, ai_schedule_start: "22:00", ai_schedule_end: "06:00" };
    expect(isAiWithinSchedule(overnight, MON_23_RIYADH)).toBe(true); // 23:00 inside
    expect(isAiWithinSchedule(overnight, MON_10_RIYADH)).toBe(false); // 10:00 outside
    expect(isAiWithinSchedule(overnight, SAT_01_RIYADH)).toBe(true); // 01:00 inside
  });

  it("fails open on invalid timezone", () => {
    expect(
      isAiWithinSchedule({ ...base, ai_schedule_timezone: "Not/AZone" }, MON_23_RIYADH)
    ).toBe(true);
  });

  it("fails open on missing bounds", () => {
    expect(
      isAiWithinSchedule({ ai_schedule_enabled: true }, MON_23_RIYADH)
    ).toBe(true);
  });
});
