import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Redirect, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Alert, Button, Card, IconTile, InputOTP, List, ListItem, Separator, Text, useTheme } from "../../../components/ui";
import { hrErrorCode, hrErrorView } from "../errors";
import { DEMO_CODE } from "../fixtures";
import type { HrErrorCode, HrVerifiedIdentity } from "../types";
import { HrHero, HrScreen, HrStepper, initials, useHrUi } from "../ui";

export function HrIndexScreen() {
  const { state, path } = useHrUi();
  const target = state.activationStatus === "active" ? "today" : state.activationStatus === "pending_first_scan" ? "first-scan" : state.activationStatus === "pending_approval" ? "waiting" : "activate";
  return <Redirect href={path(target)} />;
}

type Step = "welcome" | "code" | "identity" | "security";

export function HrActivateScreen() {
  const { t, pick, state, service, path, ar } = useHrUi();
  const { forwardArrow } = useTheme();
  const params = useLocalSearchParams<{ code?: string; step?: string }>();
  const initialCode = (params.code ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
  const [step, setStep] = useState<Step>(initialCode || params.step === "code" ? "code" : "welcome");
  const [code, setCode] = useState(initialCode);
  const [verified, setVerified] = useState<HrVerifiedIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HrErrorCode | null>(null);

  if (state.activationStatus === "active") return <Redirect href={path("today")} />;
  if (state.activationStatus === "pending_first_scan" || state.activationStatus === "pending_approval") return <Redirect href={path()} />;

  const verify = async (value = code) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { setVerified(await service.verify(value)); setStep("identity"); }
    catch (e) { setError(hrErrorCode(e)); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    setBusy(true); setError(null);
    try { await service.complete(code); router.replace(path("first-scan")); }
    catch (e) { setError(hrErrorCode(e)); setStep("code"); }
    finally { setBusy(false); }
  };

  if (step === "welcome") {
    return (
      <HrScreen flow footer={<>
        <Button testID="hr-start-activation" size="lg" iconEnd={forwardArrow} onPress={() => setStep("code")}>{t("لديّ رمز تفعيل", "I have an activation code")}</Button>
        <Button testID="hr-activation-help" variant="ghost" onPress={() => router.push({ pathname: path("help") as never, params: { topic: "code" } })}>{t("كيف أحصل على الرمز؟", "How do I get a code?")}</Button>
      </>}>
        {state.activationStatus === "revoked" ? <Alert variant="destructive" title={t("هذا الهاتف لم يعد مسجّلًا", "This phone is no longer registered")} description={t("أدخل رمز التفعيل الجديد من الموارد البشرية.", "Enter the new activation code from HR.")} /> : null}
        <HrHero icon="finger-print" tone="primary" title={t("سجّل حضورك وانصرافك بلمسة واحدة", "Check in and out with one tap")} body={t("فعّل هاتفك مرة واحدة، ثم امسح رمز الباب عند وصولك ومغادرتك.", "Set up your phone once, then scan the door code when you arrive and leave.")} />
        <List>
          <ListItem icon="qr-code-outline" title={t("امسح رمز الباب", "Scan the door code")} subtitle={t("عند وصولك ومغادرتك", "When you arrive and leave")} />
          <ListItem icon="shield-checkmark-outline" iconVariant="success" title={t("بصمتك تبقى على هاتفك", "Your fingerprint stays on your phone")} subtitle={t("لا تُرسل إلى أي مكان", "It's never sent anywhere")} />
          <ListItem icon="calendar-outline" title={t("تابع يومك وسجلّك", "Follow your day and history")} subtitle={t("في أي وقت", "Any time")} />
        </List>
      </HrScreen>
    );
  }

  if (step === "code") {
    const view = error ? hrErrorView(error) : null;
    return (
      <HrScreen flow back="activate" footer={<Button testID="hr-verify-code" size="lg" loading={busy} disabled={code.length !== 8} onPress={() => void verify()}>{t("متابعة", "Continue")}</Button>}>
        <HrStepper step={1} label={t("تفعيل الهاتف", "Phone setup")} />
        <View className="gap-2 pt-2">
          <Text variant="h1" accessibilityRole="header">{t("أدخل رمز التفعيل", "Enter your activation code")}</Text>
          <Text variant="lead">{t("الرمز المكوّن من 8 خانات في رسالة الموارد البشرية على واتساب.", "The 8-character code from your HR WhatsApp message.")}</Text>
        </View>
        <InputOTP testID="hr-activation-code" accessibilityLabel={t("رمز التفعيل", "Activation code")} value={code} onChange={(v) => { setCode(v); setError(null); }} onComplete={(v) => void verify(v)} invalid={!!error} autoFocus={!initialCode} />
        {view ? <Alert variant="destructive" title={pick(view.title)} description={pick(view.body)} /> : null}
        {!view ? (
          <Pressable testID="hr-fill-demo-code" accessibilityRole="button" onPress={() => { setCode(DEMO_CODE); void verify(DEMO_CODE); }} className="self-center rounded-full bg-warning-soft px-4 py-2 active:opacity-80">
            <Text className="text-sm font-semibold text-warning" align="center">{t("للتجربة: K7QM-4XHT · اضغط للتعبئة", "Demo: K7QM-4XHT · tap to fill")}</Text>
          </Pressable>
        ) : null}
        <Text variant="caption" align="center">{t("الحروف الكبيرة والصغيرة والشرطات لا تهم.", "Upper/lower case and dashes don't matter.")}</Text>
      </HrScreen>
    );
  }

  if (step === "identity" && verified) {
    const name = ar ? verified.employee.name_ar : verified.employee.name_en;
    return (
      <HrScreen flow back="activate" footer={<>
        <Button testID="hr-confirm-identity" size="lg" onPress={() => setStep("security")}>{t("نعم، هذا أنا", "Yes, that's me")}</Button>
        <Button testID="hr-wrong-identity" variant="outline" onPress={() => { setVerified(null); setCode(""); setStep("code"); }}>{t("ليس أنا", "That's not me")}</Button>
      </>}>
        <HrStepper step={2} label={t("تفعيل الهاتف", "Phone setup")} />
        <View className="gap-2 pt-2">
          <Text variant="h1" accessibilityRole="header">{t("هل هذا أنت؟", "Is this you?")}</Text>
          <Text variant="lead">{t("تأكّد من بياناتك قبل ربط هذا الهاتف بحسابك.", "Check your details before linking this phone.")}</Text>
        </View>
        <Card className="items-center gap-3 py-7">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-primary"><Text className="text-[28px] font-extrabold text-primary-foreground" align="center">{initials(name)}</Text></View>
          <Text variant="h2" align="center">{name}</Text>
          <Text variant="muted" align="center">{t("محاسب", verified.employee.job_title)} · {verified.employee.code}</Text>
          <Separator className="my-1" />
          <View className="w-full flex-row items-center gap-3">
            <IconTile name="business-outline" size="sm" />
            <View className="flex-1"><Text variant="caption">{t("الشركة", "Company")}</Text><Text className="font-semibold">{ar ? verified.company.name_ar : verified.company.name_en}</Text></View>
          </View>
        </Card>
      </HrScreen>
    );
  }

  return (
    <HrScreen flow back="activate" footer={<Button testID="hr-complete-activation" size="lg" loading={busy} icon="finger-print" onPress={() => void complete()}>{t("تفعيل الحماية والمتابعة", "Turn on protection")}</Button>}>
      <HrStepper step={3} label={t("تفعيل الهاتف", "Phone setup")} />
      <HrHero icon="finger-print" title={t("احمِ حضورك ببصمتك", "Protect your attendance")} body={t("كل تسجيل يُؤكَّد ببصمتك أو وجهك، فلا يستطيع أحد التسجيل بدلًا منك.", "Each scan is confirmed with your fingerprint or face, so no one can register for you.")} />
      <List>
        <ListItem icon="lock-closed-outline" iconVariant="success" title={t("بصمتك لا تغادر هاتفك", "Your biometrics never leave your phone")} />
        <ListItem icon="keypad-outline" title={t("رمز قفل الهاتف بديل عند الحاجة", "Your phone passcode works as a backup")} />
      </List>
      <Alert variant="warning" icon="flask-outline" title={t("نسخة تجريبية", "Demo version")} description={t("لن نطلب بصمة أو كاميرا حقيقية. نستخدم بيانات وهمية فقط.", "No real fingerprint or camera is used. Test data only.")} />
    </HrScreen>
  );
}

function NumberTile({ n }: { n: number }) {
  return <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary"><Text className="font-bold text-secondary-foreground" align="center">{n}</Text></View>;
}

export function HrFirstScanScreen() {
  const { t, state, path } = useHrUi();
  if (state.activationStatus !== "pending_first_scan") return <Redirect href={path()} />;
  return (
    <HrScreen flow footer={<Button testID="hr-first-scan" size="lg" icon="qr-code-outline" onPress={() => router.push({ pathname: path("scan") as never, params: { mode: "first" } })}>{t("مسح رمز الباب", "Scan the door code")}</Button>}>
      <HrHero icon="scan-outline" title={t("الخطوة الأخيرة عند الباب", "Last step: at the door")} body={t("امسح رمز الباب مرة واحدة أمام الموارد البشرية لإكمال تسجيل هاتفك.", "Scan the door code once in front of HR to finish registering your phone.")} />
      <Card className="gap-4">
        {[t("اذهب إلى شاشة الباب في مكان عملك", "Go to the door screen at work"), t("امسح الرمز أمام موظف الموارد البشرية", "Scan the code in front of HR"), t("انتظر موافقة الموارد البشرية على هاتفك", "Wait for HR to approve your phone")].map((label, i) => (
          <View key={label} className="flex-row items-center gap-3"><NumberTile n={i + 1} /><Text className="flex-1 font-semibold">{label}</Text></View>
        ))}
      </Card>
      <Alert variant="info" title={t("الصورة المرجعية تلتقطها شاشة الباب", "The door screen takes your reference photo")} description={t("هذا التطبيق لا يلتقط صورًا لك.", "This app never takes photos of you.")} />
    </HrScreen>
  );
}

export function HrWaitingScreen() {
  const { t, state, service, path } = useHrUi();
  const { color } = useTheme();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const check = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    setMessage(null);
    try {
      const me = await service.me();
      if (me.activation_status === "active") router.replace(path("today"));
      else if (!silent) setMessage(t("لم تصل الموافقة بعد. سنُحدّث الحالة تلقائيًا عند فتح التطبيق.", "Not approved yet. We'll refresh whenever you open the app."));
    } catch (e) {
      if (!silent) setMessage(hrErrorCode(e) === "offline" ? t("لا يوجد اتصال. حاول مجددًا.", "No connection. Try again.") : t("تعذّر التحقق الآن. حاول بعد قليل.", "Couldn't check right now. Try again shortly."));
    } finally { if (!silent) setBusy(false); }
  }, [service, path, t]);
  useFocusEffect(useCallback(() => { void check(true); }, [check]));
  if (state.activationStatus === "active") return <Redirect href={path("today")} />;
  if (state.activationStatus !== "pending_approval") return <Redirect href={path()} />;

  const steps: [string, boolean][] = [[t("تم ربط الهاتف بحسابك", "Phone linked to your account"), true], [t("تم مسح رمز الباب", "Door code scanned"), true], [t("موافقة الموارد البشرية", "HR approval"), false]];
  return (
    <HrScreen flow footer={<>
      <Button testID="hr-check-approval" size="lg" variant="outline" icon="refresh" loading={busy} onPress={() => void check()}>{t("تحقّق الآن", "Check now")}</Button>
      <Button testID="hr-demo-approve" variant="ghost" icon="flask-outline" onPress={async () => { await service.approveDemoDevice(); router.replace(path("today")); }}>{t("تجربة: محاكاة موافقة الموارد البشرية", "Demo: simulate HR approval")}</Button>
    </>}>
      <HrHero icon="hourglass-outline" tone="warning" title={t("كل شيء جاهز من جهتك", "You're all set")} body={t("ننتظر الآن موافقة الموارد البشرية على هاتفك. عادةً لا يستغرق ذلك طويلًا.", "HR now needs to approve your phone. This usually doesn't take long.")} />
      <Card className="gap-4">
        {steps.map(([label, done]) => (
          <View key={label} className="flex-row items-center gap-3">
            {done ? <IconTile name="checkmark" variant="success" size="sm" /> : <View className="h-10 w-10 items-center justify-center rounded-xl bg-warning-soft"><ActivityIndicator color={color("warning")} /></View>}
            <Text className={done ? "flex-1 text-muted-foreground" : "flex-1 font-bold"}>{label}</Text>
          </View>
        ))}
      </Card>
      {message ? <Alert variant="info" title={message} /> : null}
    </HrScreen>
  );
}
