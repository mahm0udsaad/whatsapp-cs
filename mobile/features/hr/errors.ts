import { HrError } from "./mock-service";
import type { HrErrorCode } from "./types";

/** What the primary button does. Recovery is chosen by `code`, never by message text. */
export type HrRecovery = "retry_same" | "rescan" | "reactivate" | "recheck" | "dismiss" | "back_today";

export interface HrErrorView {
  code: HrErrorCode;
  icon: "time-outline" | "qr-code-outline" | "checkmark-done-outline" | "cloud-offline-outline" | "phone-portrait-outline" | "ban-outline" | "alert-circle-outline" | "hourglass-outline" | "shield-outline" | "key-outline";
  tone: "warning" | "destructive" | "default";
  title: [ar: string, en: string];
  body: [ar: string, en: string];
  primary: { label: [string, string]; recovery: HrRecovery };
  /** Most errors offer a way out; blocked/revoked states do not need one. */
  cancel: boolean;
}

const v = (code: HrErrorCode, icon: HrErrorView["icon"], tone: HrErrorView["tone"], title: [string, string], body: [string, string], label: [string, string], recovery: HrRecovery, cancel = true): HrErrorView => ({ code, icon, tone, title, body, primary: { label, recovery }, cancel });

const TRY_AGAIN: [string, string] = ["حاول مجددًا", "Try again"];
const SCAN_AGAIN: [string, string] = ["امسح مجددًا", "Scan again"];
const BLOCKED_TITLE: [string, string] = ["تسجيل الحضور غير متاح لك", "Attendance isn't available for you"];
const RECHECK: [string, string] = ["تحقّق مجددًا", "Check again"];

const views: Record<HrErrorCode, HrErrorView> = {
  qr_expired: v("qr_expired", "time-outline", "warning", ["انتهت صلاحية رمز الباب", "This door code expired"], ["الرمز يتغيّر كل 15 ثانية. امسح الشاشة مرة أخرى.", "The code changes every 15 seconds. Scan the screen again."], SCAN_AGAIN, "rescan"),
  qr_invalid: v("qr_invalid", "qr-code-outline", "destructive", ["هذا ليس رمز باب شركتك", "That's not your company's door code"], ["امسح الرمز الظاهر على شاشة الباب في مكان عملك.", "Scan the code shown on the door screen at your workplace."], SCAN_AGAIN, "rescan"),
  duplicate_punch: v("duplicate_punch", "checkmark-done-outline", "default", ["سجّلت قبل قليل", "You just registered"], ["تم حفظ تسجيلك الأخير. يمكنك التسجيل مرة أخرى بعد دقيقتين.", "Your last scan is saved. You can register again in two minutes."], ["حسنًا", "OK"], "back_today", false),
  offline: v("offline", "cloud-offline-outline", "warning", ["لم يتم التسجيل", "Not registered"], ["هاتفك غير متصل بالإنترنت. اتصل ثم حاول مجددًا. إذا كان هاتفك لا يعمل، استخدم زر «هاتفي لا يعمل» على شاشة الباب.", "Your phone is offline. Connect and try again. If your phone isn't working, use “My phone isn't working” on the door screen."], TRY_AGAIN, "retry_same"),
  timeout_after_punch: v("timeout_after_punch", "hourglass-outline", "warning", ["لم نتأكد من التسجيل", "We couldn't confirm that"], ["ربما وصل تسجيلك. أعد المحاولة وستظهر النتيجة نفسها دون تكرار.", "Your scan may have arrived. Try again — you'll see the same result, never a duplicate."], TRY_AGAIN, "retry_same"),
  signature_invalid: v("signature_invalid", "shield-outline", "destructive", ["تعذّر التحقق من هاتفك", "We couldn't verify your phone"], ["امسح مرة أخرى. إذا تكرر ذلك، اطلب رمز تفعيل جديدًا من الموارد البشرية.", "Scan again. If it keeps happening, ask HR for a new activation code."], SCAN_AGAIN, "rescan"),
  revoked: v("revoked", "phone-portrait-outline", "destructive", ["هذا الهاتف لم يعد مسجّلًا", "This phone is no longer registered"], ["ألغت الموارد البشرية تسجيل هذا الهاتف أو أصدرت رمزًا لهاتف جديد. اطلب رمز تفعيل جديدًا.", "HR removed this phone or issued a code for a new one. Ask for a new activation code."], ["إدخال رمز جديد", "Enter a new code"], "reactivate", false),
  device_revoked: v("device_revoked", "phone-portrait-outline", "destructive", ["هذا الهاتف لم يعد مسجّلًا", "This phone is no longer registered"], ["ألغت الموارد البشرية تسجيل هذا الهاتف أو أصدرت رمزًا لهاتف جديد. اطلب رمز تفعيل جديدًا.", "HR removed this phone or issued a code for a new one. Ask for a new activation code."], ["إدخال رمز جديد", "Enter a new code"], "reactivate", false),
  employee_inactive: v("employee_inactive", "ban-outline", "warning", BLOCKED_TITLE, ["حسابك الوظيفي غير نشط. تواصل مع الموارد البشرية في شركتك.", "Your employee record is inactive. Contact HR at your company."], RECHECK, "recheck", false),
  attendance_not_tracked: v("attendance_not_tracked", "ban-outline", "warning", BLOCKED_TITLE, ["الحضور غير مفعّل لحسابك. تواصل مع الموارد البشرية في شركتك.", "Attendance is turned off for you. Contact HR at your company."], RECHECK, "recheck", false),
  subscription_inactive: v("subscription_inactive", "ban-outline", "warning", BLOCKED_TITLE, ["اشتراك شركتك منتهٍ. تواصل مع الموارد البشرية في شركتك.", "Your company's subscription has ended. Contact HR at your company."], RECHECK, "recheck", false),
  activation_code_invalid: v("activation_code_invalid", "key-outline", "destructive", ["الرمز غير صحيح", "That code isn't right"], ["تحقّق من الرمز المكوّن من 8 خانات في رسالة الموارد البشرية.", "Check the 8-character code in your HR message."], TRY_AGAIN, "dismiss"),
  activation_code_expired: v("activation_code_expired", "time-outline", "warning", ["انتهت صلاحية الرمز", "This code expired"], ["الرمز صالح 72 ساعة فقط. اطلب رمزًا جديدًا من الموارد البشرية.", "Codes last 72 hours. Ask HR for a new one."], TRY_AGAIN, "dismiss"),
  activation_code_used: v("activation_code_used", "key-outline", "warning", ["استُخدم هذا الرمز من قبل", "This code was already used"], ["كل رمز يعمل مرة واحدة على هاتف واحد. اطلب رمزًا جديدًا.", "Each code works once, on one phone. Ask HR for a new one."], TRY_AGAIN, "dismiss"),
  server_error: v("server_error", "alert-circle-outline", "warning", ["الخدمة غير متاحة الآن", "The service is unavailable"], ["لم يُسجَّل شيء. حاول بعد قليل.", "Nothing was recorded. Try again shortly."], TRY_AGAIN, "retry_same"),
  rate_limited: v("rate_limited", "hourglass-outline", "warning", ["محاولات كثيرة", "Too many attempts"], ["انتظر 30 ثانية ثم حاول مجددًا.", "Wait 30 seconds, then try again."], TRY_AGAIN, "retry_same"),
  validation_failed: v("validation_failed", "alert-circle-outline", "destructive", ["تعذّر إكمال الطلب", "Something went wrong"], ["امسح رمز الباب مرة أخرى.", "Scan the door code again."], SCAN_AGAIN, "rescan"),
  device_not_approved: v("device_not_approved", "hourglass-outline", "default", ["هاتفك بانتظار الموافقة", "Your phone is awaiting approval"], ["أكمل التفعيل وانتظر موافقة الموارد البشرية.", "Finish setup and wait for HR approval."], ["متابعة", "Continue"], "recheck", false),
  unauthenticated: v("unauthenticated", "key-outline", "default", ["فعّل هذا الهاتف", "Activate this phone"], ["استخدم رمز التفعيل من الموارد البشرية.", "Use the activation code from HR."], ["إدخال الرمز", "Enter code"], "reactivate", false),
  presence_check_expired: v("presence_check_expired", "time-outline", "default", ["انتهى وقت التحقّق", "This check has ended"], ["لا يغيّر ذلك أوقات حضورك. ستصلك إشعارات التحقّق القادمة كالمعتاد.", "Your attendance times are unchanged. You'll be notified of the next check."], ["العودة إلى اليوم", "Back to today"], "back_today", false),
  not_found: v("not_found", "alert-circle-outline", "default", ["لم يعد هذا متاحًا", "This is no longer available"], ["ارجع إلى الصفحة الرئيسية لرؤية آخر حالة.", "Go back to Today for the latest status."], ["العودة إلى اليوم", "Back to today"], "back_today", false),
};

export function hrErrorView(code: HrErrorCode): HrErrorView {
  return views[code];
}

/** Structured code from any thrown value; unknown failures are treated as a server error. */
export function hrErrorCode(error: unknown): HrErrorCode {
  return error instanceof HrError ? error.code : "server_error";
}

const BLOCKING: HrErrorCode[] = ["employee_inactive", "attendance_not_tracked", "subscription_inactive"];

/** Employee-level blocks known before any action, so Today can explain them up front. */
export function hrBlockingCode(state: { activationStatus: string; scenario: string }): HrErrorCode | null {
  if (state.activationStatus === "revoked") return "device_revoked";
  return BLOCKING.includes(state.scenario as HrErrorCode) ? (state.scenario as HrErrorCode) : null;
}
