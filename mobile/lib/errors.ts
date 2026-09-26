/**
 * Turn any thrown value into a short Arabic message that is safe to show a
 * user. Raw error text (serialized Response objects, stack traces, HTTP
 * dumps from supabase-js / fetch) must never reach the screen.
 */

export const MSG_OFFLINE = "تعذّر الاتصال بالإنترنت. تحقّق من الشبكة وحاول مرة أخرى.";
export const MSG_TIMEOUT = "انتهت مهلة الاتصال. حاول مرة أخرى.";
export const MSG_SERVER_DOWN = "الخدمة غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل.";
export const MSG_RATE_LIMIT = "محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.";
export const MSG_BAD_CREDENTIALS = "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
export const MSG_EMAIL_NOT_CONFIRMED = "لم يتم تأكيد البريد الإلكتروني بعد. تحقّق من بريدك.";
export const MSG_SESSION_EXPIRED = "انتهت الجلسة. سجّل الدخول مرة أخرى.";

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
};

const ARABIC = /[؀-ۿ]/;
const TECHNICAL =
  /https?:\/\/|\bstatus\b|statusText|headers|bodyUsed|_bodyInit|TypeError|ReferenceError|undefined|\bnull\b|JSON|Non-JSON|stack|at \w+ \(|\[object /i;

function readStatus(e: ErrorLike): number | null {
  if (typeof e.status === "number") return e.status;
  if (typeof e.message === "string") {
    const m = e.message.match(/^\[(\d{3})\]/) ?? e.message.match(/"status":\s*(\d{3})/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** True when a message is fit to show as-is. */
function isPresentable(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 160) return false;
  if (/^[\[{]/.test(text)) return false;
  if (ARABIC.test(text)) return true;
  return !TECHNICAL.test(text);
}

export function toUserMessage(error: unknown, fallback = "حدث خطأ. حاول مرة أخرى."): string {
  if (error == null) return fallback;
  if (typeof error === "string") return isPresentable(error) ? error : fallback;
  if (typeof error !== "object") return fallback;

  const e = error as ErrorLike;
  const name = typeof e.name === "string" ? e.name : "";
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : "";
  const status = readStatus(e);

  if (name === "AbortError" || name === "TimeoutError" || /timed? ?out/i.test(message)) {
    return MSG_TIMEOUT;
  }
  if (/network request failed|failed to fetch|network ?error|load failed/i.test(message)) {
    return MSG_OFFLINE;
  }
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return MSG_BAD_CREDENTIALS;
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return MSG_EMAIL_NOT_CONFIRMED;
  }
  if (
    code === "refresh_token_not_found" ||
    code === "session_not_found" ||
    code === "session_expired" ||
    /invalid refresh token|jwt expired/i.test(message)
  ) {
    return MSG_SESSION_EXPIRED;
  }
  if (status === 429 || code === "over_request_rate_limit") return MSG_RATE_LIMIT;
  if (status !== null && status >= 500) return MSG_SERVER_DOWN;
  if (name === "AuthRetryableFetchError") {
    // supabase-js uses status 0 for "couldn't reach the server".
    return status === 0 ? MSG_OFFLINE : MSG_SERVER_DOWN;
  }
  if (name === "AuthUnknownError") return MSG_SERVER_DOWN;

  const cleaned = message.replace(/^\[\d+\]\s*/, "").trim();
  return isPresentable(cleaned) ? cleaned : fallback;
}
