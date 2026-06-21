/**
 * AI bot scheduling.
 *
 * Managers can restrict the auto-reply bot to a daily working window (e.g.
 * 09:00–22:00) and optionally let it run 24h on the weekend (Friday/Saturday,
 * the Saudi weekend). `isAiWithinSchedule` is the single source of truth used by
 * both the inbound webhook and the AI reply worker to decide whether the bot is
 * allowed to answer right now.
 */

export interface AiScheduleConfig {
  ai_schedule_enabled?: boolean | null;
  /** "HH:MM" or "HH:MM:SS" in ai_schedule_timezone. */
  ai_schedule_start?: string | null;
  ai_schedule_end?: string | null;
  ai_schedule_weekend_24h?: boolean | null;
  ai_schedule_timezone?: string | null;
}

const DEFAULT_TZ = "Asia/Riyadh";

/** Parse "HH:MM" / "HH:MM:SS" into minutes past midnight, or null if invalid. */
export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Returns the local weekday (0=Sun..6=Sat) and minutes-past-midnight for `now`
 * in the given IANA timezone. Falls back gracefully if Intl is unavailable.
 */
function localPartsInTimezone(
  now: Date,
  timeZone: string
): { weekday: number; minutes: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[get("weekday")] ?? now.getUTCDay();
  // Intl can emit "24" for midnight with hour12:false; normalise to 0.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return { weekday, minutes: hour * 60 + minute };
}

/** Friday (5) and Saturday (6) — the Saudi weekend. */
export function isWeekend(weekday: number): boolean {
  return weekday === 5 || weekday === 6;
}

/**
 * Whether the AI bot is allowed to auto-reply at `now` for a given restaurant.
 *
 * - Scheduling disabled  → always allowed (legacy behaviour).
 * - Weekend + 24h flag   → always allowed on Fri/Sat.
 * - Otherwise            → allowed iff inside [start, end]. Overnight windows
 *   (start > end, e.g. 22:00–06:00) are supported.
 */
export function isAiWithinSchedule(
  config: AiScheduleConfig | null | undefined,
  now: Date = new Date()
): boolean {
  if (!config || config.ai_schedule_enabled !== true) return true;

  const tz = config.ai_schedule_timezone || DEFAULT_TZ;
  let local: { weekday: number; minutes: number };
  try {
    local = localPartsInTimezone(now, tz);
  } catch {
    // Bad timezone string — fail open so a misconfiguration never silences the bot.
    return true;
  }

  if (config.ai_schedule_weekend_24h === true && isWeekend(local.weekday)) {
    return true;
  }

  const start = parseTimeToMinutes(config.ai_schedule_start);
  const end = parseTimeToMinutes(config.ai_schedule_end);
  // Missing/invalid bounds → fail open rather than silently disabling the bot.
  if (start === null || end === null) return true;

  // Full-day window.
  if (start === end) return true;

  if (start < end) {
    // Same-day window, inclusive of both ends.
    return local.minutes >= start && local.minutes <= end;
  }
  // Overnight window (e.g. 22:00–06:00): inside if after start OR before end.
  return local.minutes >= start || local.minutes <= end;
}
