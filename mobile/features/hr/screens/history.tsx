import { useMemo, useState } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { Badge, List, NumberText, SegmentedControl, Text } from "../../../components/ui";
import type { HrHistoryDay } from "../types";
import { HrHero, HrScreen, latinDigits, minutesLabel, useHrUi } from "../ui";

export type HistoryRange = "week" | "month" | "previous";

const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Inclusive date range in the company calendar for a preset. */
export function historyRange(range: HistoryRange, workDate: string): { from: string; to: string } {
  const today = Date.parse(`${workDate}T00:00:00Z`);
  const [y, m] = workDate.split("-").map(Number);
  if (range === "week") return { from: iso(today - 7 * day), to: workDate };
  if (range === "month") return { from: `${workDate.slice(0, 7)}-01`, to: workDate };
  const firstThis = Date.UTC(y, m - 1, 1);
  const firstPrev = Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1);
  return { from: iso(firstPrev), to: iso(firstThis - day) };
}

export function historySummary(days: HrHistoryDay[]) {
  return {
    present: days.filter((d) => d.status === "present" || d.status === "late" || d.status === "on_duty").length,
    lateMinutes: days.reduce((sum, d) => sum + d.late_minutes, 0),
    missing: days.filter((d) => d.status === "missing").length,
  };
}

function DayRow({ d }: { d: HrHistoryDay }) {
  const { t, ar } = useHrUi();
  const date = new Date(`${d.work_date}T12:00:00Z`);
  const weekday = latinDigits(new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { weekday: "short", timeZone: "UTC" }).format(date));
  const status: { label: string; variant: "success" | "warning" | "destructive" | "muted" | "default" } = {
    present: { label: t("حاضر", "Present"), variant: "success" as const },
    on_duty: { label: t("على رأس العمل", "On duty"), variant: "default" as const },
    late: { label: t(`متأخر · ${d.late_minutes} د`, `Late · ${d.late_minutes} min`), variant: "warning" as const },
    missing: { label: t("بصمة ناقصة", "Missing scan"), variant: "destructive" as const },
    leave: { label: t("إجازة", "Leave"), variant: "default" as const },
    weekend: { label: t("عطلة نهاية الأسبوع", "Weekend"), variant: "muted" as const },
    not_in: { label: t("لم يسجّل", "No scans"), variant: "muted" as const },
  }[d.status];
  const hasTimes = d.in !== null;
  return (
    <View className="min-h-[72px] flex-row items-center gap-3 px-4 py-3">
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <NumberText className="text-lg font-extrabold leading-6" align="center">{Number(d.work_date.slice(8))}</NumberText>
        <Text variant="caption" align="center">{weekday}</Text>
      </View>
      <View className="flex-1 gap-1.5">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Badge variant={status.variant} label={status.label} />
          {d.night_shift ? <Badge variant="outline" icon="moon-outline" label={t("ليلية", "Night")} /> : null}
        </View>
        {hasTimes ? <NumberText className="text-[15px] font-semibold text-foreground/90">{`${d.in} → ${d.out ?? "--:--"}`}</NumberText> : null}
      </View>
      {d.worked_minutes > 0 && d.out ? (
        <View className="items-end">
          <NumberText className="text-base font-bold">{minutesLabel(d.worked_minutes)}</NumberText>
          <Text variant="caption">{t("ساعة", "hrs")}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function HrHistoryScreen() {
  const { t, state, history, today, path } = useHrUi();
  const [range, setRange] = useState<HistoryRange>("week");
  const days = useMemo(() => {
    const { from, to } = historyRange(range, today.work_date);
    return history.filter((d) => d.work_date >= from && d.work_date <= to);
  }, [history, range, today.work_date]);
  if (state.activationStatus !== "active") return <Redirect href={path()} />;
  const summary = historySummary(days);

  return (
    <HrScreen title={t("السجل", "History")} section="history">
      <SegmentedControl testIDPrefix="hr-range" value={range} onChange={setRange} options={[
        { value: "week", label: t("هذا الأسبوع", "This week") },
        { value: "month", label: t("هذا الشهر", "This month") },
        { value: "previous", label: t("الشهر الماضي", "Last month") },
      ]} />
      <View className="flex-row gap-2.5">
        {[
          [summary.present, t("أيام حضور", "Days present"), "text-foreground"],
          [summary.lateMinutes, t("دقيقة تأخير", "Minutes late"), summary.lateMinutes ? "text-warning" : "text-foreground"],
          [summary.missing, t("بصمة ناقصة", "Missing scans"), summary.missing ? "text-destructive" : "text-foreground"],
        ].map(([value, label, tone]) => (
          <View key={String(label)} className="flex-1 gap-1 rounded-3xl border border-border bg-card p-4">
            <NumberText className={`text-[26px] font-extrabold leading-8 ${tone}`}>{value}</NumberText>
            <Text variant="caption">{label}</Text>
          </View>
        ))}
      </View>
      {days.length ? (
        <List>{days.map((d) => <DayRow key={d.work_date} d={d} />)}</List>
      ) : (
        <HrHero icon="calendar-clear-outline" title={t("لا توجد سجلات", "No records")} body={t("لا توجد أيام عمل مسجّلة في هذه الفترة.", "There are no workdays recorded in this period.")} />
      )}
      <Text variant="caption" align="center">{t("حالات الأيام والملخّص بيانات تجريبية", "Day statuses and totals are demo data")}</Text>
    </HrScreen>
  );
}
