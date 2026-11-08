import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Alert, Badge, Button, Card, IconTile, List, ListItem, NumberText, Progress, Text, useTheme } from "../../../components/ui";
import { cn } from "../../../lib/utils";
import { HrErrorState } from "../error-state";
import { hrBlockingCode, hrErrorCode } from "../errors";
import { createDemoScan } from "../mock-service";
import type { HrErrorCode, HrScan } from "../types";
import { HrHero, HrScreen, countdown, initials, latinDigits, ltr, minutesLabel, useHrUi } from "../ui";

function useActiveGuard() {
  const { state, path } = useHrUi();
  return state.activationStatus === "active" || state.activationStatus === "revoked" ? null : <Redirect href={path()} />;
}

function StatTile({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value: string }) {
  const { color } = useTheme();
  return (
    <View className="flex-1 gap-2 rounded-3xl border border-border bg-card p-4" style={{ borderCurve: "continuous" }}>
      <Ionicons name={icon} size={18} color={color("muted-foreground")} />
      <NumberText className="text-[22px] font-extrabold leading-7">{value}</NumberText>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

export function HrTodayScreen() {
  const guard = useActiveGuard();
  const { t, ar, state, today, pending, path, now } = useHrUi();
  const { color, forwardIcon } = useTheme();
  if (guard) return guard;

  const blocked = hrBlockingCode(state);
  const name = ar ? state.employee.name_ar : state.employee.name_en;
  const firstName = name.split(" ")[0];
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: state.company.timezone }).format(now));
  const greeting = hour < 12 ? t("صباح الخير", "Good morning") : t("مساء الخير", "Good evening");
  const header = (
    <View className="flex-row items-center gap-3">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-primary"><Text className="font-extrabold text-primary-foreground" align="center">{initials(name)}</Text></View>
      <View className="flex-1">
        <Text className="text-[17px] font-bold leading-6" numberOfLines={1}>{greeting}{t("، ", ", ")}{firstName}</Text>
        <Text variant="caption" numberOfLines={1}>{ar ? state.company.name_ar : state.company.name_en}</Text>
      </View>
    </View>
  );

  if (blocked) {
    return <HrScreen header={header} section="today"><HrErrorState code={blocked} onRecheck={() => router.replace(path())} /></HrScreen>;
  }

  const presence = pending[0];
  const checkIn = today.next_punch_type === "in";
  const date = latinDigits(new Intl.DateTimeFormat(ar ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: state.company.timezone }).format(now));
  const status = today.status === "on_duty" ? { label: t("على رأس العمل", "On duty"), variant: "success" as const } : today.status === "present" ? { label: t("اكتمل يومك", "Day complete"), variant: "default" as const } : { label: t("لم تسجّل بعد", "Not checked in"), variant: "muted" as const };
  const last = today.punches[today.punches.length - 1];

  return (
    <HrScreen header={header} section="today">
      {presence ? (
        <Pressable testID="hr-presence-banner" accessibilityRole="button" accessibilityLabel={t("تحقّق حضور مطلوب", "Presence check required")} onPress={() => router.push(path(`presence/${presence.id}`))} className="flex-row items-center gap-3 rounded-3xl bg-accent p-4 active:opacity-90">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-accent-foreground/10"><Ionicons name="alarm-outline" size={24} color={color("accent-foreground")} /></View>
          <View className="flex-1">
            <Text className="font-bold text-accent-foreground">{t("أكّد وجودك الآن", "Confirm you're here")}</Text>
            <Text className="text-sm text-accent-foreground/80">{t("امسح رمز الباب · متبقٍ ", "Scan the door code · ")}<NumberText className="text-sm font-bold text-accent-foreground">{countdown(presence.seconds_left)}</NumberText></Text>
          </View>
          <Ionicons name={forwardIcon} size={20} color={color("accent-foreground")} />
        </Pressable>
      ) : null}

      <Card className="items-center gap-5 py-6">
        <View className="w-full flex-row items-center justify-between gap-2">
          <Text className="flex-1 font-semibold">{date}</Text>
          <Badge variant={status.variant} label={status.label} dot={today.status === "on_duty"} />
        </View>
        <View className="rounded-full bg-secondary p-3">
          <Pressable
            testID="hr-punch-action"
            accessibilityRole="button"
            accessibilityLabel={checkIn ? t("تسجيل الحضور", "Check in") : t("تسجيل الانصراف", "Check out")}
            accessibilityHint={t("يفتح ماسح رمز الباب", "Opens the door code scanner")}
            onPress={() => router.push({ pathname: path("scan") as never, params: { mode: "punch" } })}
            className={cn("h-48 w-48 items-center justify-center gap-2 rounded-full active:opacity-85", checkIn ? "bg-primary" : "bg-foreground")}
            style={{ boxShadow: "0 14px 30px rgba(1, 31, 145, 0.25)" }}
          >
            <Ionicons name="qr-code-outline" size={44} color="#FCBD05" />
            <Text align="center" className={cn("text-xl font-extrabold", checkIn ? "text-primary-foreground" : "text-background")}>{checkIn ? t("تسجيل الحضور", "Check in") : t("تسجيل الانصراف", "Check out")}</Text>
            <Text align="center" className={cn("text-xs", checkIn ? "text-primary-foreground/80" : "text-background/80")}>{t("اضغط وامسح رمز الباب", "Tap, then scan the door")}</Text>
          </Pressable>
        </View>
        <Text variant="muted" align="center">
          {last ? `${last.type === "in" ? t("آخر تسجيل: حضور", "Last: check-in") : t("آخر تسجيل: انصراف", "Last: check-out")} · ${ltr(last.time)}` : t("سجّل حضورك عند وصولك إلى العمل", "Check in when you arrive at work")}
        </Text>
      </Card>

      <View className="flex-row gap-2.5">
        <StatTile icon="log-in-outline" label={t("الحضور", "Arrival")} value={today.in ?? "--:--"} />
        <StatTile icon="log-out-outline" label={t("الانصراف", "Leaving")} value={today.out ?? "--:--"} />
        <StatTile icon="time-outline" label={t("ساعات العمل", "Worked")} value={minutesLabel(today.worked_minutes)} />
      </View>

      <List>
        <ListItem icon="briefcase-outline" title={t("دوامك اليوم", "Today's shift")} subtitle={`${ltr(`${today.schedule.start} – ${today.schedule.end}`)} · ${t("المكتب الرئيسي", "Head office")}`} trailing={today.late_minutes > 0 ? <Badge variant="warning" label={t(`تأخير ${today.late_minutes} د`, `${today.late_minutes} min late`)} /> : undefined} />
        <ListItem testID="hr-open-history" icon="calendar-outline" title={t("سجل الحضور", "Attendance history")} subtitle={t("أيامك وساعات عملك", "Your days and hours")} onPress={() => router.replace(path("history"))} />
      </List>

      {today.punches.length > 1 ? (
        <Card className="gap-3">
          <Text variant="h3">{t("تسجيلات اليوم", "Today's scans")}</Text>
          {today.punches.map((p) => (
            <View key={p.id} className="flex-row items-center gap-3">
              <IconTile name={p.type === "in" ? "log-in-outline" : "log-out-outline"} variant={p.type === "in" ? "success" : "muted"} size="sm" />
              <Text className="flex-1 font-semibold">{p.type === "in" ? t("حضور", "Check-in") : t("انصراف", "Check-out")}</Text>
              <NumberText className="font-bold">{p.time}</NumberText>
            </View>
          ))}
        </Card>
      ) : null}
      <Text variant="caption" align="center">{t("بيانات تجريبية · لا يُسجَّل حضور فعلي", "Test data · No real attendance is recorded")}</Text>
    </HrScreen>
  );
}

function Viewfinder() {
  const line = useSharedValue(0);
  useEffect(() => { line.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true); }, [line]);
  const lineStyle = useAnimatedStyle(() => ({ top: `${8 + line.value * 84}%` }));
  const corner = "absolute h-12 w-12 border-accent";
  return (
    <View className="aspect-square w-full max-w-[300px] self-center">
      <View className={cn(corner, "left-0 top-0 rounded-tl-3xl border-l-4 border-t-4")} />
      <View className={cn(corner, "right-0 top-0 rounded-tr-3xl border-r-4 border-t-4")} />
      <View className={cn(corner, "bottom-0 left-0 rounded-bl-3xl border-b-4 border-l-4")} />
      <View className={cn(corner, "bottom-0 right-0 rounded-br-3xl border-b-4 border-r-4")} />
      <View className="absolute inset-6 items-center justify-center rounded-2xl bg-card/60">
        <Ionicons name="qr-code" size={120} color="rgba(238, 241, 250, 0.18)" />
      </View>
      <Animated.View style={[{ position: "absolute", left: 24, right: 24, height: 2, borderRadius: 2, backgroundColor: "#FCBD05", boxShadow: "0 0 12px rgba(252, 189, 5, 0.9)" }, lineStyle]} />
    </View>
  );
}

type Phase = "scan" | "auth" | "submitting" | "error";

export function HrScanScreen() {
  const { t, service, path, today, state } = useHrUi();
  const { mode = "punch", id } = useLocalSearchParams<{ mode?: "punch" | "first" | "presence"; id?: string }>();
  const [phase, setPhase] = useState<Phase>("scan");
  const [error, setError] = useState<HrErrorCode | null>(null);
  const [flash, setFlash] = useState(false);
  // One body per user action; retries reuse it so the server can de-duplicate.
  const body = useRef<HrScan | null>(null);
  const cancelTarget = mode === "first" ? "first-scan" : mode === "presence" ? `presence/${id}` : "today";

  if (mode === "first" ? state.activationStatus !== "pending_first_scan" : state.activationStatus !== "active") return <Redirect href={path()} />;

  const submit = async (scan: HrScan) => {
    setPhase("submitting"); setError(null);
    try {
      if (mode === "first") { await service.firstScan(scan); router.replace(path("waiting")); }
      else if (mode === "presence") { await service.confirmPresence(Number(id), scan); router.replace({ pathname: path("result") as never, params: { kind: "presence" } }); }
      else { const r = await service.punch(scan); router.replace({ pathname: path("result") as never, params: { kind: r.punch.type, time: r.punch.time } }); }
    } catch (e) {
      const code = hrErrorCode(e);
      if (code === "device_not_approved" || code === "unauthenticated") { router.replace(path()); return; }
      setError(code); setPhase("error");
    }
  };
  const authenticate = (method: HrScan["auth_method"]) => { body.current = createDemoScan(method); void submit(body.current); };
  const rescan = () => { body.current = null; setError(null); setPhase("scan"); };
  const cancel = () => router.replace(path(cancelTarget));
  const title = mode === "first" ? t("مسح رمز الباب", "Scan the door code") : mode === "presence" ? t("تأكيد الوجود", "Confirm presence") : today.next_punch_type === "in" ? t("تسجيل الحضور", "Check in") : t("تسجيل الانصراف", "Check out");

  if (phase === "error" && error) {
    return <HrScreen flow immersive title={title}><View className="flex-1 justify-center gap-3"><HrErrorState code={error} onRetrySame={() => body.current ? void submit(body.current) : rescan()} onRescan={rescan} onCancel={cancel} /></View></HrScreen>;
  }
  if (phase === "submitting") {
    return <HrScreen flow immersive title={title}><View className="flex-1 items-center justify-center gap-4"><ActivityIndicator size="large" color="#FCBD05" /><Text variant="h3" align="center">{t("جارٍ التسجيل…", "Registering…")}</Text><Text variant="muted" align="center">{t("لا تغلق التطبيق", "Keep the app open")}</Text></View></HrScreen>;
  }
  if (phase === "auth") {
    return (
      <HrScreen flow immersive title={title} footer={<>
        <Button testID="hr-biometric-confirm" size="lg" variant="accent" icon="finger-print" onPress={() => authenticate("biometric_bound")}>{t("تأكيد بالبصمة", "Confirm with fingerprint")}</Button>
        <Button testID="hr-pin-confirm" variant="outline" icon="keypad-outline" onPress={() => authenticate("device_credential")}>{t("استخدام رمز قفل الهاتف", "Use phone passcode")}</Button>
        <Button testID="hr-auth-cancel" variant="ghost" onPress={cancel}>{t("إلغاء", "Cancel")}</Button>
      </>}>
        <View className="flex-1 justify-center">
          <HrHero icon="finger-print" tone="primary" title={t("أكّد أنه أنت", "Confirm it's you")} body={t("تمت قراءة رمز الباب. ضع إصبعك على المستشعر للإكمال.", "Door code read. Touch the sensor to finish.")} />
          <Text variant="caption" align="center">{t("محاكاة · لن يُطلب منك بصمة حقيقية", "Simulation · No real fingerprint is requested")}</Text>
        </View>
      </HrScreen>
    );
  }
  return (
    <HrScreen flow immersive title={title} back={cancelTarget} footer={<>
      <Button testID="hr-simulate-scan" size="lg" variant="accent" icon="scan-outline" onPress={() => setPhase("auth")}>{t("محاكاة قراءة الرمز", "Simulate reading the code")}</Button>
      <View className="flex-row gap-2">
        <Button testID="hr-demo-flash" className="flex-1" variant="outline" icon={flash ? "flash" : "flash-outline"} onPress={() => setFlash(!flash)}>{flash ? t("إطفاء الفلاش", "Flash off") : t("الفلاش", "Flash")}</Button>
        <Button testID="hr-scan-cancel" className="flex-1" variant="ghost" onPress={cancel}>{t("إلغاء", "Cancel")}</Button>
      </View>
    </>}>
      <View className="flex-1 justify-center gap-6 py-2">
        <Viewfinder />
        <View className="gap-1.5">
          <Text variant="h3" align="center">{t("وجّه الكاميرا نحو رمز الباب", "Point at the door code")}</Text>
          <Text variant="muted" align="center">{t("الرمز يتغيّر كل 15 ثانية. امسح الشاشة نفسها، لا صورة لها.", "The code changes every 15 seconds. Scan the live screen, not a photo.")}</Text>
        </View>
        <View className="self-center"><Badge variant="warning" icon="flask-outline" label={t("محاكاة · الكاميرا غير مفعّلة", "Simulation · Camera off")} /></View>
      </View>
    </HrScreen>
  );
}

export function HrResultScreen() {
  const { t, path, today, state, ar } = useHrUi();
  const { kind = "in", time = "" } = useLocalSearchParams<{ kind?: "in" | "out" | "presence"; time?: string }>();
  if (state.activationStatus !== "active") return <Redirect href={path()} />;
  const title = kind === "presence" ? t("تم تأكيد وجودك", "Presence confirmed") : kind === "out" ? t("تم تسجيل انصرافك", "You're checked out") : t("تم تسجيل حضورك", "You're checked in");
  return (
    <HrScreen flow footer={<Button testID="hr-result-done" size="lg" onPress={() => router.replace(path("today"))}>{t("تم", "Done")}</Button>}>
      <View className="flex-1 justify-center gap-5">
        <HrHero icon="checkmark" tone="success" title={title}>
          {kind !== "presence" && time ? <NumberText variant="display" align="center">{time}</NumberText> : null}
          <Badge variant="muted" icon="location-outline" label={ar ? "المكتب الرئيسي" : "Head office"} />
        </HrHero>
        <Card className="items-center gap-1">
          <Text variant="large" align="center">{kind === "presence" ? t("لم تتغيّر أوقات حضورك", "Your attendance times are unchanged") : kind === "out" ? t(`عملت اليوم ${minutesLabel(today.worked_minutes)} ساعة`, `You worked ${minutesLabel(today.worked_minutes)} today`) : t("يومًا موفقًا!", "Have a great day!")}</Text>
          <Text variant="muted" align="center">{t("محفوظ في بيانات التجربة فقط", "Saved to demo data only")}</Text>
        </Card>
      </View>
    </HrScreen>
  );
}

export function HrPresenceScreen() {
  const guard = useActiveGuard();
  const { t, pending, path, state } = useHrUi();
  const { id } = useLocalSearchParams<{ id: string }>();
  if (guard) return guard;
  const index = pending.findIndex((item) => String(item.id) === id);
  const check = pending[index];
  if (!check) {
    return <HrScreen flow back="today" title={t("تحقّق الحضور", "Presence check")}><View className="flex-1 justify-center"><HrErrorState code="presence_check_expired" /></View></HrScreen>;
  }
  const windowSeconds = state.settings.presence_check_window * 60;
  const urgent = check.seconds_left <= 60;
  return (
    <HrScreen flow back="today" title={t("تحقّق الحضور", "Presence check")} footer={
      <Button testID="hr-presence-scan" size="lg" icon="qr-code-outline" onPress={() => router.push({ pathname: path("scan") as never, params: { mode: "presence", id } })}>{t("مسح رمز الباب", "Scan the door code")}</Button>
    }>
      {pending.length > 1 ? <Badge variant="default" label={t(`تحقّق ${index + 1} من ${pending.length}`, `Check ${index + 1} of ${pending.length}`)} /> : null}
      <View className="gap-2">
        <Text variant="h1" accessibilityRole="header">{t("أكّد وجودك في العمل", "Confirm you're at work")}</Text>
        <Text variant="lead">{t("امسح رمز الباب قبل انتهاء الوقت.", "Scan the door code before time runs out.")}</Text>
      </View>
      <Card className="items-center gap-4 py-8">
        <View className={cn("h-44 w-44 items-center justify-center rounded-full border-[10px]", urgent ? "border-destructive-soft" : "border-secondary")}>
          <NumberText accessibilityLabel={t("الوقت المتبقي", "Time remaining")} className={cn("text-[44px] font-extrabold leading-[52px]", urgent && "text-destructive")} align="center">{countdown(check.seconds_left)}</NumberText>
          <Text variant="caption" align="center">{t("متبقٍ", "left")}</Text>
        </View>
        <Progress value={check.seconds_left / windowSeconds} indicatorClassName={urgent ? "bg-destructive" : "bg-primary"} accessibilityLabel={t("الوقت المتبقي", "Time remaining")} />
      </Card>
      <Alert variant="info" title={t("لا يغيّر هذا أوقات حضورك", "This won't change your attendance times")} description={t("التحقّق يؤكد وجودك فقط.", "It only confirms you're present.")} />
    </HrScreen>
  );
}
