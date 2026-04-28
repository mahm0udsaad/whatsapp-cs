"use client";

import {
  MouseEvent as ReactMouseEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface TeamMember {
  id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  is_available: boolean;
}

interface Shift {
  id: string;
  restaurant_id: string;
  team_member_id: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
}

interface OnDutyAgent {
  team_member_id: string;
  user_id: string | null;
  full_name: string | null;
  role: string;
  is_available: boolean;
  shift_starts_at: string;
  shift_ends_at: string;
  note: string | null;
}

interface ShiftsCalendarProps {
  restaurantId: string;
  initialMembers: TeamMember[];
  initialShifts: Shift[];
}

// 8 distinct pairs (bg + border + text) — stable by team member id hash.
const MEMBER_PALETTE: Array<{ bg: string; border: string; text: string; bar: string }> = [
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-900", bar: "bg-emerald-500" },
  { bg: "bg-sky-100", border: "border-sky-300", text: "text-sky-900", bar: "bg-sky-500" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-900", bar: "bg-amber-500" },
  { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-900", bar: "bg-rose-500" },
  { bg: "bg-violet-100", border: "border-violet-300", text: "text-violet-900", bar: "bg-violet-500" },
  { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-900", bar: "bg-teal-500" },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", bar: "bg-indigo-500" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-900", bar: "bg-orange-500" },
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

function colorFor(memberId: string) {
  return MEMBER_PALETTE[hashId(memberId) % MEMBER_PALETTE.length];
}

const AR_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  `${String(i).padStart(2, "0")}:00`
);
const HOUR_PX = 48;
const HALF_HOUR_PX = 24;

function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameYmd(a: Date, b: Date): boolean {
  return ymdLocal(a) === ymdLocal(b);
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "D MMM" in Arabic-Gregorian */
function fmtDayLabel(d: Date): string {
  return new Intl.DateTimeFormat("ar", { day: "numeric", month: "short" }).format(d);
}

/** "From - To" weekly range label */
function fmtWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const f = new Intl.DateTimeFormat("ar", { day: "numeric", month: "short" });
  return `${f.format(start)} – ${f.format(end)}`;
}

/** Snap a Date to the nearest 30-minute boundary (rounding down). */
function snap30(d: Date): Date {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() < 30 ? 0 : 30, 0, 0);
  return x;
}

function pxToMinutes(px: number): number {
  return Math.round((px / HOUR_PX) * 60);
}

/** Combine local-midnight date + minute offset → Date */
function dayPlusMinutes(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

export function ShiftsCalendar({
  restaurantId,
  initialMembers,
  initialShifts,
}: ShiftsCalendarProps) {
  const [viewStart, setViewStart] = useState<Date>(() => weekStart(new Date()));
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);
  const [onDuty, setOnDuty] = useState<OnDutyAgent[]>([]);
  const [now, setNow] = useState<Date>(() => new Date());
  const [focused, setFocused] = useState<{ day: number; hour: number }>(() => {
    const d = new Date();
    return { day: d.getDay(), hour: d.getHours() };
  });

  const [createModal, setCreateModal] = useState<
    | {
        startsAt: Date;
        endsAt: Date;
        teamMemberId: string;
        note: string;
        error?: string;
        saving?: boolean;
      }
    | null
  >(null);

  const [editModal, setEditModal] = useState<
    | {
        id: string;
        teamMemberId: string;
        startsAt: Date;
        endsAt: Date;
        note: string;
        error?: string;
        saving?: boolean;
      }
    | null
  >(null);

  const [copyBusy, setCopyBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);

  const memberById = useMemo(() => {
    const m = new Map<string, TeamMember>();
    for (const tm of members) m.set(tm.id, tm);
    return m;
  }, [members]);

  // ------------------------------------------------------------------------
  // Week navigation
  // ------------------------------------------------------------------------
  const daysInView = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(viewStart, i)),
    [viewStart]
  );

  const weekLabel = fmtWeekRange(viewStart);

  // Fetch shifts for the active week whenever it changes (SSR provides the
  // current week; subsequent nav fetches client-side).
  const loadWeek = useCallback(
    async (start: Date) => {
      const key = ymdLocal(start);
      const res = await fetch(
        `/api/dashboard/shifts?weekStart=${encodeURIComponent(key)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const json = (await res.json()) as { shifts: Shift[]; members?: TeamMember[] };
      setShifts(json.shifts ?? []);
      if (json.members) setMembers(json.members);
    },
    []
  );

  useEffect(() => {
    loadWeek(viewStart).catch(() => {});
  }, [viewStart, loadWeek]);

  // ------------------------------------------------------------------------
  // Realtime subscription
  // ------------------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`shifts:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_shifts",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setShifts((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Shift;
              if (prev.some((p) => p.id === row.id)) return prev;
              return [...prev, row];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as Shift;
              return prev.map((p) => (p.id === row.id ? row : p));
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as { id: string };
              return prev.filter((p) => p.id !== row.id);
            }
            return prev;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  // ------------------------------------------------------------------------
  // "Currently on duty" poll
  // ------------------------------------------------------------------------
  const loadOnDuty = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.rpc("current_on_duty_agents", {
      p_restaurant_id: restaurantId,
    });
    setOnDuty((data ?? []) as OnDutyAgent[]);
  }, [restaurantId]);

  useEffect(() => {
    loadOnDuty();
    const t = setInterval(loadOnDuty, 60000);
    return () => clearInterval(t);
  }, [loadOnDuty]);

  // ------------------------------------------------------------------------
  // "Now" indicator tick
  // ------------------------------------------------------------------------
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // ------------------------------------------------------------------------
  // Click-drag to create
  // ------------------------------------------------------------------------
  const columnRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [dragState, setDragState] = useState<
    | {
        dayIndex: number;
        startMinutes: number;
        endMinutes: number;
      }
    | null
  >(null);

  const onColumnMouseDown = (
    e: ReactMouseEvent<HTMLDivElement>,
    dayIndex: number
  ) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.colbg) {
      // only start drag on background (not on shift block)
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = Math.max(0, Math.min(24 * 60 - 1, pxToMinutes(y)));
    setDragState({ dayIndex, startMinutes: minutes, endMinutes: minutes + 30 });
  };

  const onColumnMouseMove = (
    e: ReactMouseEvent<HTMLDivElement>,
    dayIndex: number
  ) => {
    if (!dragState || dragState.dayIndex !== dayIndex) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = Math.max(0, Math.min(24 * 60, pxToMinutes(y)));
    setDragState({ ...dragState, endMinutes: minutes });
  };

  const onColumnMouseUp = () => {
    if (!dragState) return;
    const day = daysInView[dragState.dayIndex];
    const rawStart = Math.min(dragState.startMinutes, dragState.endMinutes);
    const rawEnd = Math.max(dragState.startMinutes, dragState.endMinutes);
    const startDate = snap30(dayPlusMinutes(day, rawStart));
    let endDate = snap30(dayPlusMinutes(day, rawEnd));
    if (endDate.getTime() - startDate.getTime() < 30 * 60 * 1000) {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    }
    const firstActive = members.find((m) => m.is_active);
    setCreateModal({
      startsAt: startDate,
      endsAt: endDate,
      teamMemberId: firstActive?.id ?? "",
      note: "",
    });
    setDragState(null);
  };

  // If the user mouseups outside a column.
  useEffect(() => {
    const up = () => setDragState(null);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // ------------------------------------------------------------------------
  // Keyboard navigation
  // ------------------------------------------------------------------------
  const onGridKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      setFocused((prev) => {
        let { day, hour } = prev;
        if (e.key === "ArrowUp") hour = Math.max(0, hour - 1);
        if (e.key === "ArrowDown") hour = Math.min(23, hour + 1);
        if (e.key === "ArrowLeft") day = Math.min(6, day + 1); // RTL: left = next
        if (e.key === "ArrowRight") day = Math.max(0, day - 1);
        return { day, hour };
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const day = daysInView[focused.day];
      const startDate = dayPlusMinutes(day, focused.hour * 60);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      const firstActive = members.find((m) => m.is_active);
      setCreateModal({
        startsAt: startDate,
        endsAt: endDate,
        teamMemberId: firstActive?.id ?? "",
        note: "",
      });
    }
  };

  // ------------------------------------------------------------------------
  // Shifts visible in this week (local-time window)
  // ------------------------------------------------------------------------
  const weekShifts = useMemo(() => {
    const ws = viewStart.getTime();
    const we = addDays(viewStart, 7).getTime();
    return shifts.filter((s) => {
      const start = new Date(s.starts_at).getTime();
      const end = new Date(s.ends_at).getTime();
      return start < we && end > ws;
    });
  }, [shifts, viewStart]);

  // ------------------------------------------------------------------------
  // Save handlers
  // ------------------------------------------------------------------------
  const saveCreate = async () => {
    if (!createModal) return;
    if (!createModal.teamMemberId) {
      setCreateModal({ ...createModal, error: "اختاري الموظفة." });
      return;
    }
    setCreateModal({ ...createModal, saving: true, error: undefined });
    const res = await fetch("/api/dashboard/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamMemberId: createModal.teamMemberId,
        startsAt: createModal.startsAt.toISOString(),
        endsAt: createModal.endsAt.toISOString(),
        note: createModal.note || undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; shift?: Shift };
    if (!res.ok) {
      setCreateModal({
        ...createModal,
        saving: false,
        error: json.error ?? "تعذّر الحفظ.",
      });
      return;
    }
    if (json.shift) {
      setShifts((prev) =>
        prev.some((p) => p.id === json.shift!.id) ? prev : [...prev, json.shift!]
      );
    }
    setCreateModal(null);
    loadOnDuty();
  };

  const saveEdit = async () => {
    if (!editModal) return;
    setEditModal({ ...editModal, saving: true, error: undefined });
    const res = await fetch(`/api/dashboard/shifts/${editModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamMemberId: editModal.teamMemberId,
        startsAt: editModal.startsAt.toISOString(),
        endsAt: editModal.endsAt.toISOString(),
        note: editModal.note || null,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; shift?: Shift };
    if (!res.ok) {
      setEditModal({
        ...editModal,
        saving: false,
        error: json.error ?? "تعذّر الحفظ.",
      });
      return;
    }
    if (json.shift) {
      setShifts((prev) => prev.map((p) => (p.id === json.shift!.id ? json.shift! : p)));
    }
    setEditModal(null);
    loadOnDuty();
  };

  const deleteEdit = async () => {
    if (!editModal) return;
    setEditModal({ ...editModal, saving: true, error: undefined });
    const res = await fetch(`/api/dashboard/shifts/${editModal.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setEditModal({
        ...editModal,
        saving: false,
        error: json.error ?? "تعذّر الحذف.",
      });
      return;
    }
    setShifts((prev) => prev.filter((p) => p.id !== editModal.id));
    setEditModal(null);
    loadOnDuty();
  };

  const copyLastWeek = async () => {
    setCopyBusy(true);
    try {
      const res = await fetch("/api/dashboard/shifts/copy-last-week", {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        copied?: number;
        skipped?: number;
        error?: string;
      };
      if (!res.ok) {
        setFlash(json.error ?? "تعذّر النسخ.");
      } else {
        setFlash(`نُسخت ${json.copied ?? 0} · تم تخطّي ${json.skipped ?? 0}`);
        loadWeek(viewStart);
      }
    } finally {
      setCopyBusy(false);
      setShowCopyConfirm(false);
      setTimeout(() => setFlash(null), 3500);
    }
  };

  // ------------------------------------------------------------------------
  // On-duty rail
  // ------------------------------------------------------------------------
  const openTodayModal = () => {
    const now = new Date();
    const startDate = snap30(now);
    const endDate = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
    const firstActive = members.find((m) => m.is_active);
    setCreateModal({
      startsAt: startDate,
      endsAt: endDate,
      teamMemberId: firstActive?.id ?? "",
      note: "",
    });
  };

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* On-duty rail */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">على الدوام الآن</h2>
          <button
            onClick={loadOnDuty}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            <RefreshCw size={12} aria-hidden="true" />
            تحديث
          </button>
        </div>
        {onDuty.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span>لا يوجد موظفة على الدوام حالياً</span>
            <button
              onClick={openTodayModal}
              className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800"
            >
              افتحي جدول اليوم
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {onDuty.map((a) => {
              const c = colorFor(a.team_member_id);
              const initials = (a.full_name ?? "؟")
                .trim()
                .split(/\s+/)
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();
              return (
                <div
                  key={a.team_member_id}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
                    c.bg,
                    c.border,
                    c.text
                  )}
                  title={`${a.full_name ?? ""} · ${hhmm(new Date(a.shift_starts_at))} - ${hhmm(new Date(a.shift_ends_at))}`}
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-xs font-bold">
                    {initials}
                  </span>
                  <span className="text-sm font-semibold">
                    {a.full_name ?? "—"}
                  </span>
                  <span className="text-[11px] opacity-75">
                    {a.role === "admin" ? "مديرة" : "موظفة"}
                  </span>
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full",
                      a.is_available ? "bg-emerald-500" : "bg-slate-400"
                    )}
                    aria-label={a.is_available ? "متاحة" : "غير متاحة"}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Week header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewStart((v) => addDays(v, -7))}
            aria-label="الأسبوع السابق"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewStart(weekStart(new Date()))}
          >
            اليوم
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewStart((v) => addDays(v, 7))}
            aria-label="الأسبوع التالي"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </Button>
          <span className="ms-2 text-sm font-semibold text-slate-800">
            {weekLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {flash ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {flash}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCopyConfirm(true)}
            disabled={copyBusy}
          >
            <Copy size={14} aria-hidden="true" />
            نسخ من الأسبوع الماضي
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <div
        role="application"
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        aria-label="جدول الدوامات الأسبوعي. استخدمي الأسهم للتنقل و Enter لإضافة دوام."
        className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
      >
        {/* Weekday header */}
        <div
          className="grid border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
          style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
        >
          <div className="px-2 py-2" />
          {daysInView.map((d, i) => {
            const isToday = sameYmd(d, new Date());
            return (
              <div
                key={i}
                className={cn(
                  "border-s border-slate-200 px-2 py-2 text-center",
                  isToday && "bg-emerald-50 text-emerald-800"
                )}
              >
                <div>{AR_WEEKDAYS[d.getDay()]}</div>
                <div className="text-[11px] text-slate-500">{fmtDayLabel(d)}</div>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div
          className="relative grid"
          style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
        >
          {/* Hour labels column */}
          <div>
            {HOUR_LABELS.map((h, i) => (
              <div
                key={i}
                style={{ height: HOUR_PX }}
                className="border-b border-slate-100 px-2 pt-1 text-[11px] text-slate-500"
              >
                {h}
              </div>
            ))}
          </div>

          {/* 7 day columns */}
          {daysInView.map((day, dayIdx) => {
            const isToday = sameYmd(day, now);
            const nowMinutes =
              now.getHours() * 60 + now.getMinutes();
            const todayCellShifts = weekShifts
              .filter((s) => {
                const ss = new Date(s.starts_at);
                return sameYmd(ss, day);
              })
              // long shifts wrapping midnight still render on start day only;
              // we clamp the render to 24h for simplicity.
              ;
            return (
              <div
                key={dayIdx}
                ref={(el) => {
                  columnRefs.current[dayIdx] = el;
                }}
                data-colbg="1"
                onMouseDown={(e) => onColumnMouseDown(e, dayIdx)}
                onMouseMove={(e) => onColumnMouseMove(e, dayIdx)}
                onMouseUp={onColumnMouseUp}
                className={cn(
                  "relative border-s border-slate-200 select-none",
                  isToday && "bg-emerald-50/40"
                )}
                style={{ height: HOUR_PX * 24 }}
              >
                {/* half-hour gridlines */}
                {Array.from({ length: 24 }).map((_, h) => (
                  <div
                    key={h}
                    data-colbg="1"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 border-t border-slate-100"
                    style={{ top: h * HOUR_PX }}
                  />
                ))}

                {/* focused cell highlight */}
                {focused.day === dayIdx ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 bg-emerald-200/20 outline outline-2 outline-emerald-400"
                    style={{
                      top: focused.hour * HOUR_PX,
                      height: HOUR_PX,
                    }}
                  />
                ) : null}

                {/* drag preview */}
                {dragState && dragState.dayIndex === dayIdx ? (
                  <div
                    className="pointer-events-none absolute inset-x-1 rounded-md border border-dashed border-emerald-500 bg-emerald-200/40"
                    style={{
                      top:
                        (Math.min(dragState.startMinutes, dragState.endMinutes) /
                          60) *
                        HOUR_PX,
                      height:
                        (Math.abs(dragState.endMinutes - dragState.startMinutes) /
                          60) *
                        HOUR_PX,
                    }}
                  />
                ) : null}

                {/* shift blocks */}
                {todayCellShifts.map((s) => {
                  const start = new Date(s.starts_at);
                  const end = new Date(s.ends_at);
                  const startMin = start.getHours() * 60 + start.getMinutes();
                  let endMin = end.getHours() * 60 + end.getMinutes();
                  if (!sameYmd(start, end)) endMin = 24 * 60;
                  const top = (startMin / 60) * HOUR_PX;
                  const height = Math.max(
                    HALF_HOUR_PX,
                    ((endMin - startMin) / 60) * HOUR_PX
                  );
                  const tm = memberById.get(s.team_member_id);
                  const name = tm?.full_name ?? "—";
                  const c = colorFor(s.team_member_id);
                  const title = `${name} · ${hhmm(start)} - ${hhmm(end)}${s.note ? ` · ${s.note}` : ""}`;
                  return (
                    <button
                      key={s.id}
                      onMouseDown={(e) => {
                        // Prevent drag creation from firing.
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditModal({
                          id: s.id,
                          teamMemberId: s.team_member_id,
                          startsAt: new Date(s.starts_at),
                          endsAt: new Date(s.ends_at),
                          note: s.note ?? "",
                        });
                      }}
                      title={title}
                      className={cn(
                        "absolute inset-x-1 overflow-hidden rounded-lg border text-right shadow-sm transition-all hover:shadow-md",
                        c.bg,
                        c.border,
                        c.text
                      )}
                      style={{ top, height }}
                    >
                      <div
                        className={cn("h-1 w-full", c.bar)}
                        aria-hidden="true"
                      />
                      <div className="px-2 py-1 text-right">
                        <div className="truncate text-xs font-semibold">
                          {name}
                        </div>
                        <div className="text-[10px] opacity-75">
                          {hhmm(start)} - {hhmm(end)}
                        </div>
                        {s.note ? (
                          <div className="mt-0.5 truncate text-[10px] opacity-75">
                            {s.note}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}

                {/* "now" indicator */}
                {isToday ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-10"
                    style={{ top: (nowMinutes / 60) * HOUR_PX }}
                  >
                    <div className="h-0.5 w-full bg-red-500" />
                    <div className="absolute -top-1 end-0 h-2 w-2 rounded-full bg-red-500" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Create modal */}
      {createModal ? (
        <ShiftModal
          title="إضافة دوام"
          teamMembers={members.filter((m) => m.is_active)}
          state={createModal}
          onChange={(patch) => setCreateModal({ ...createModal, ...patch })}
          onClose={() => setCreateModal(null)}
          onSave={saveCreate}
        />
      ) : null}

      {/* Edit modal */}
      {editModal ? (
        <ShiftModal
          title="تعديل الدوام"
          teamMembers={members.filter((m) => m.is_active)}
          state={editModal}
          onChange={(patch) => setEditModal({ ...editModal, ...patch })}
          onClose={() => setEditModal(null)}
          onSave={saveEdit}
          onDelete={deleteEdit}
        />
      ) : null}

      {showCopyConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (!copyBusy) setShowCopyConfirm(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="copy-last-week-title"
            className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 id="copy-last-week-title" className="text-lg font-bold text-slate-950">
                نسخ دوامات الأسبوع الماضي
              </h3>
              <button
                onClick={() => setShowCopyConfirm(false)}
                disabled={copyBusy}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="إغلاق"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              سيتم نسخ دوامات الأسبوع الماضي إلى هذا الأسبوع مع تخطّي الفترات الموجودة أو المتعارضة.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCopyConfirm(false)}
                disabled={copyBusy}
              >
                إلغاء
              </Button>
              <Button type="button" onClick={() => void copyLastWeek()} disabled={copyBusy}>
                {copyBusy ? "جارٍ النسخ…" : "نسخ الدوامات"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Modal (shared by create + edit)
// ----------------------------------------------------------------------------
interface ShiftModalState {
  teamMemberId: string;
  startsAt: Date;
  endsAt: Date;
  note: string;
  error?: string;
  saving?: boolean;
}

function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function toLocalTimeInput(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${mi}`;
}
function fromLocalParts(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const [h, mi] = timeStr.split(":").map((n) => parseInt(n, 10));
  const out = new Date();
  out.setFullYear(y, (m || 1) - 1, d || 1);
  out.setHours(h || 0, mi || 0, 0, 0);
  return out;
}

function ShiftModal({
  title,
  teamMembers,
  state,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  title: string;
  teamMembers: TeamMember[];
  state: ShiftModalState;
  onChange: (patch: Partial<ShiftModalState>) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const startDate = toLocalDateInput(state.startsAt);
  const startTime = toLocalTimeInput(state.startsAt);
  const endDate = toLocalDateInput(state.endsAt);
  const endTime = toLocalTimeInput(state.endsAt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      aria-hidden="true"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-modal-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl focus:outline-none"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="shift-modal-title" className="text-lg font-bold text-slate-950">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            aria-label="إغلاق"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">الموظفة</span>
            <select
              value={state.teamMemberId}
              onChange={(e) => onChange({ teamMemberId: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">اختاري موظفة</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name ?? "—"} ({m.role === "admin" ? "مديرة" : "موظفة"})
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">تاريخ البداية</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) =>
                  onChange({
                    startsAt: fromLocalParts(e.target.value, startTime),
                  })
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">وقت البداية</span>
              <input
                type="time"
                step={1800}
                value={startTime}
                onChange={(e) =>
                  onChange({
                    startsAt: fromLocalParts(startDate, e.target.value),
                  })
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">تاريخ النهاية</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) =>
                  onChange({
                    endsAt: fromLocalParts(e.target.value, endTime),
                  })
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">وقت النهاية</span>
              <input
                type="time"
                step={1800}
                value={endTime}
                onChange={(e) =>
                  onChange({
                    endsAt: fromLocalParts(endDate, e.target.value),
                  })
                }
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              ملاحظة (اختياري)
            </span>
            <textarea
              value={state.note}
              onChange={(e) => onChange({ note: e.target.value })}
              rows={2}
              maxLength={500}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          {state.error ? (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
              {state.error}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {onDelete ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={onDelete}
                disabled={state.saving}
              >
                <Trash2 size={14} aria-hidden="true" />
                حذف
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={state.saving}
            >
              إلغاء
            </Button>
            <Button size="sm" onClick={onSave} disabled={state.saving}>
              {state.saving ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
