import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Button, Sheet, Text } from "../../components/ui";
import { cn } from "../../lib/utils";
import type { HrScenario } from "./types";
import { useHrUi } from "./ui";

const groups: { title: [string, string]; items: [HrScenario, string, string][] }[] = [
  { title: ["التفعيل", "Activation"], items: [["new", "موظف جديد", "New employee"], ["pending_first_scan", "بانتظار مسح الباب", "Needs door scan"], ["pending_approval", "بانتظار الموافقة", "Awaiting approval"], ["activation_code_invalid", "رمز غير صحيح", "Invalid code"], ["activation_code_expired", "رمز منتهي", "Expired code"], ["activation_code_used", "رمز مستخدم", "Used code"]] },
  { title: ["اليوم", "Today"], items: [["active", "لم يسجّل بعد", "Not checked in"], ["on_duty", "على رأس العمل", "On duty"], ["completed", "اكتمل اليوم", "Day complete"], ["presence", "تحقّق حضور", "Presence check"], ["empty_history", "سجل فارغ", "Empty history"]] },
  { title: ["الأخطاء", "Errors"], items: [["qr_expired", "رمز باب منتهي", "Expired QR"], ["qr_invalid", "رمز باب غير صالح", "Invalid QR"], ["duplicate_punch", "تسجيل مكرر", "Duplicate punch"], ["offline", "بدون اتصال", "Offline"], ["timeout_after_punch", "انقطاع بعد الإرسال", "Timeout after send"], ["signature_invalid", "فشل التحقق", "Signature failed"], ["server_error", "خطأ في الخدمة", "Server error"], ["rate_limited", "محاولات كثيرة", "Rate limited"]] },
  { title: ["الحساب", "Account"], items: [["revoked", "الهاتف ملغى", "Phone revoked"], ["employee_inactive", "موظف غير نشط", "Inactive employee"], ["attendance_not_tracked", "الحضور غير مفعّل", "Not tracked"], ["subscription_inactive", "اشتراك منتهٍ", "Subscription ended"]] },
];

/** Dev/preview only. Never part of the employee workflow. */
export function HrDemoControls({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, pick, state, setScenario, reset, triggerPresence, advanceClock, path } = useHrUi();
  const go = (scenario: HrScenario) => { setScenario(scenario); onClose(); router.replace(path()); };
  return (
    <Sheet open={open} onClose={onClose} title={t("أدوات التجربة", "Demo controls")} description={t("تظهر في نسخ التطوير والمعاينة فقط. لا تغيّر أي بيانات حقيقية.", "Development and preview builds only. No real data changes.")}>
      <View className="flex-row gap-2">
        <Button className="flex-1" size="sm" variant="secondary" icon="notifications-outline" onPress={() => { const id = triggerPresence(); onClose(); router.push(path(`presence/${id}`)); }} disabled={state.activationStatus !== "active"}>{t("إرسال تحقّق", "Send check")}</Button>
        <Button className="flex-1" size="sm" variant="secondary" icon="play-forward-outline" onPress={() => advanceClock(5 * 60_000)}>{t("تقديم 5 دقائق", "+5 minutes")}</Button>
      </View>
      {groups.map((group) => (
        <View key={group.title[1]} className="gap-2">
          <Text variant="label">{pick(group.title)}</Text>
          <View className="flex-row flex-wrap gap-2">
            {group.items.map(([scenario, ar, en]) => {
              const selected = state.scenario === scenario;
              return (
                <Pressable key={scenario} testID={`hr-scenario-${scenario}`} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => go(scenario)} className={cn("min-h-[40px] justify-center rounded-full border px-3.5", selected ? "border-primary bg-primary" : "border-border bg-card active:bg-muted")}>
                  <Text className={cn("text-sm font-semibold", selected ? "text-primary-foreground" : "text-foreground")}>{t(ar, en)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Button variant="destructive-outline" icon="refresh" onPress={() => { reset(); onClose(); router.replace(path()); }}>{t("إعادة ضبط التجربة", "Reset demo")}</Button>
    </Sheet>
  );
}
