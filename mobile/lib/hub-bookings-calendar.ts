import { format, isValid, parse } from "date-fns";
import type { HubBooking } from "./hub-api";

const HUB_DATE_FORMATS = ["dd-MM-yyyy", "yyyy-MM-dd"] as const;

const MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const WEEKDAY_SHORT = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];
const WEEKDAY_LONG = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

export const hubWeekdaysShort = WEEKDAY_SHORT;

export function parseHubDate(value?: string | null): Date | null {
  if (!value) return null;
  for (const pattern of HUB_DATE_FORMATS) {
    const parsed = parse(value, pattern, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

export function toHubDayKey(value?: string | null): string | null {
  const parsed = parseHubDate(value);
  return parsed ? format(parsed, "yyyy-MM-dd") : null;
}

export function getHubMonthTitle(value: Date): string {
  return `${MONTH_NAMES[value.getMonth()]} ${format(value, "yyyy")}`;
}

export function getHubDayTitle(value?: string | null): string {
  const parsed = parseHubDate(value);
  if (!parsed) return "اليوم";
  return `${WEEKDAY_LONG[parsed.getDay()]} ${format(parsed, "d")} ${MONTH_NAMES[parsed.getMonth()]}`;
}

export function compareHubBookingsByTime(a: HubBooking, b: HubBooking): number {
  const left = a.time_from ?? "";
  const right = b.time_from ?? "";
  return left.localeCompare(right);
}
