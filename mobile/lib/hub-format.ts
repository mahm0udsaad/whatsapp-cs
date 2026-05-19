/** Display helpers for Nehgz Hub data. */

import type { HubLocalized } from "./hub-api";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "قيد الانتظار", tone: "warning" },
  confirmed: { label: "مؤكّد", tone: "success" },
  cancelled: { label: "ملغى", tone: "danger" },
  completed: { label: "مكتمل", tone: "info" },
};

export function bookingStatusMeta(status: string | undefined): {
  label: string;
  tone: Tone;
} {
  if (!status) return { label: "—", tone: "neutral" };
  return STATUS_META[status] ?? { label: status, tone: "neutral" };
}

/** Resolve a possibly-localized ({ ar, en }) string to Arabic-first text. */
export function localized(
  value: HubLocalized | string | undefined | null
): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.ar ?? value.en ?? "";
}

/** Format "YYYY-MM-DD" + "HH:MM" times into a compact RTL-friendly string. */
export function formatSlot(
  date?: string,
  from?: string,
  to?: string
): string {
  const parts: string[] = [];
  if (date) parts.push(date);
  if (from && to) parts.push(`${from} - ${to}`);
  else if (from) parts.push(from);
  return parts.join("  ·  ") || "—";
}
