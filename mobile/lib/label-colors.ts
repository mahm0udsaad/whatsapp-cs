// Map label color names (stored on conversation_labels.color) to Tailwind
// classes. Keeping this in one place so we can rebrand the palette without
// a migration.

import type { LabelColor } from "./api";

export const labelChipClasses: Record<
  LabelColor,
  { bg: string; fg: string; border: string }
> = {
  slate: { bg: "bg-slate-100", fg: "text-slate-800", border: "border-slate-200" },
  red: { bg: "bg-red-100", fg: "text-red-800", border: "border-red-200" },
  amber: { bg: "bg-amber-100", fg: "text-amber-900", border: "border-amber-200" },
  emerald: { bg: "bg-emerald-100", fg: "text-emerald-900", border: "border-emerald-200" },
  blue: { bg: "bg-blue-100", fg: "text-blue-900", border: "border-blue-200" },
  indigo: { bg: "bg-indigo-100", fg: "text-indigo-900", border: "border-indigo-200" },
  fuchsia: { bg: "bg-fuchsia-100", fg: "text-fuchsia-900", border: "border-fuchsia-200" },
  rose: { bg: "bg-rose-100", fg: "text-rose-900", border: "border-rose-200" },
};

export const labelColorOrder: LabelColor[] = [
  "emerald",
  "blue",
  "indigo",
  "fuchsia",
  "rose",
  "amber",
  "red",
  "slate",
];
