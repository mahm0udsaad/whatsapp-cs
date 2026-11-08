import { useState } from "react";
import { Alert as NativeAlert, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import Constants from "expo-constants";
import { AccordionItem, Alert, Badge, Button, Card, List, ListItem, SegmentedControl, Switch, Text } from "../../../components/ui";
import type { HrLocale } from "../types";
import { HrScreen, initials, useHrUi } from "../ui";

export function HrAccountScreen() {
  const { t, ar, state, service, path, setLocale, setTheme } = useHrUi();
  const [busy, setBusy] = useState(false);
  if (state.activationStatus !== "active") return <Redirect href={path()} />;
  const name = ar ? state.employee.name_ar : state.employee.name_en;

  const logout = () => NativeAlert.alert(
    t("تسجيل الخروج من هذا الهاتف؟", "Sign this phone out?"),
    t("ستحتاج إلى رمز تفعيل جديد من الموارد البشرية لتسجيل الحضور مجددًا. حسابك في نِحجز لن يتأثر.", "You'll need a new activation code from HR to record attendance again. Your Nehgz account isn't affected."),
    [
      { text: t("تراجع", "Cancel"), style: "cancel" },
      { text: t("تسجيل الخروج", "Sign out"), style: "destructive", onPress: async () => { setBusy(true); try { await service.logout(); router.replace(path()); } finally { setBusy(false); } } },
    ],
  );

  return (
    <HrScreen title={t("حسابي", "Account")} section="account">
      <Card className="flex-row items-center gap-4">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-primary"><Text className="text-[22px] font-extrabold text-primary-foreground" align="center">{initials(name)}</Text></View>
        <View className="flex-1 gap-0.5">
          <Text variant="h3">{name}</Text>
          <Text variant="muted">{t("محاسب", state.employee.job_title)} · {ar ? state.company.name_ar : state.company.name_en}</Text>
        </View>
      </Card>

      <Text variant="label" className="px-1">{t("التفضيلات", "Preferences")}</Text>
      <List>
        <ListItem icon="language-outline" title={t("اللغة", "Language")} trailing={
          <SegmentedControl<HrLocale> testIDPrefix="hr-locale" className="w-32" value={state.locale} onChange={setLocale} options={[{ value: "ar", label: "ع" }, { value: "en", label: "EN" }]} />
        } />
        <ListItem icon="moon-outline" title={t("المظهر الداكن", "Dark appearance")} trailing={<Switch testID="hr-theme-switch" accessibilityLabel={t("المظهر الداكن", "Dark appearance")} value={state.theme === "dark"} onValueChange={(v) => setTheme(v ? "dark" : "light")} />} />
        <ListItem icon="notifications-outline" title={t("الإشعارات", "Notifications")} subtitle={t("لتحقّقات الحضور", "For presence checks")} trailing={<Badge variant="success" label={t("مفعّلة", "On")} />} />
      </List>

      <Text variant="label" className="px-1">{t("هذا الهاتف", "This phone")}</Text>
      <List>
        <ListItem icon="phone-portrait-outline" title={t("هاتف تجريبي", state.device.model)} subtitle={t("مسجّل باسمك", "Registered to you")} trailing={<Badge variant="success" icon="checkmark" label={t("مُعتمد", "Approved")} />} />
        <ListItem icon="location-outline" title={t("مكان العمل", "Workplace")} subtitle={t("المكتب الرئيسي", "Head office")} />
        <ListItem testID="hr-open-help" icon="help-circle-outline" title={t("المساعدة", "Help")} onPress={() => router.push(path("help"))} />
      </List>

      <Button testID="hr-logout" variant="destructive-outline" icon="log-out-outline" loading={busy} onPress={logout}>{t("تسجيل الخروج من هذا الهاتف", "Sign this phone out")}</Button>
      <Text variant="caption" align="center">{t("نِحجز للحضور", "Nehgz Attendance")} · {t("الإصدار", "Version")} {Constants.expoConfig?.version ?? "—"}</Text>
    </HrScreen>
  );
}

export function HrHelpScreen() {
  const { t, state, path } = useHrUi();
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  const activated = state.activationStatus === "active";
  return (
    <HrScreen flow={!activated} back={activated ? "account" : "activate"} title={t("المساعدة", "Help")}>
      <Card className="gap-4">
        <View className="gap-1">
          <Text variant="h3">{t("كيف أحصل على رمز التفعيل؟", "How do I get an activation code?")}</Text>
          <Text variant="muted">{t("ترسل لك الموارد البشرية رابط دعوة على واتساب.", "HR sends you an invitation link on WhatsApp.")}</Text>
        </View>
        {[
          [t("افتح رابط الدعوة", "Open the invitation link"), t("من رسالة واتساب الموارد البشرية", "From HR's WhatsApp message")],
          [t("اضغط «افتح التطبيق»", "Tap “Open the app”"), t("أو انسخ الرمز المكوّن من 8 خانات", "Or copy the 8-character code")],
          [t("الرمز صالح 72 ساعة", "The code lasts 72 hours"), t("ولمرة واحدة على هاتف واحد", "Once, on one phone")],
        ].map(([title, sub], i) => (
          <View key={title} className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary"><Text className="font-bold text-secondary-foreground" align="center">{i + 1}</Text></View>
            <View className="flex-1"><Text className="font-semibold">{title}</Text><Text variant="caption">{sub}</Text></View>
          </View>
        ))}
        {!activated ? <Button testID="hr-help-enter-code" onPress={() => router.replace({ pathname: path("activate") as never, params: { step: "code" } })}>{t("إدخال الرمز", "Enter the code")}</Button> : null}
      </Card>

      <Text variant="label" className="px-1">{t("أسئلة شائعة", "Common questions")}</Text>
      <List>
        <AccordionItem testID="hr-faq-lost" icon="battery-dead-outline" title={t("نفدت بطارية هاتفي أو فقدته", "My phone died or I lost it")} defaultOpen={topic === "lost"}>{t("استخدم زر «هاتفي لا يعمل» على شاشة الباب وأدخل رقمك الوظيفي. يحتاج موافقة مديرك.", "Use “My phone isn't working” on the door screen and enter your employee number. Your manager approves it.")}</AccordionItem>
        <AccordionItem icon="swap-horizontal-outline" title={t("غيّرت هاتفي", "I changed my phone")}>{t("اطلب رمز تفعيل جديدًا من الموارد البشرية. يتوقف الهاتف القديم تلقائيًا.", "Ask HR for a new activation code. Your old phone stops working automatically.")}</AccordionItem>
        <AccordionItem icon="time-outline" title={t("ظهرت رسالة «الرمز منتهي»", "It says the code expired")}>{t("رمز الباب يتغيّر كل 15 ثانية. امسح الشاشة مرة أخرى.", "The door code changes every 15 seconds. Scan the screen again.")}</AccordionItem>
        <AccordionItem icon="cloud-offline-outline" title={t("لا يوجد إنترنت", "No internet")}>{t("يحتاج التسجيل إلى الإنترنت على هاتفك. اتصل ثم امسح مجددًا. لا يُحفظ أي تسجيل بدون اتصال.", "Registering needs internet on your phone. Connect, then scan again. Nothing is saved offline.")}</AccordionItem>
      </List>
      <Alert variant="info" icon="people-outline" title={t("لم تجد إجابتك؟", "Still stuck?")} description={t("تواصل مع الموارد البشرية في شركتك.", "Contact HR at your company.")} />
    </HrScreen>
  );
}
