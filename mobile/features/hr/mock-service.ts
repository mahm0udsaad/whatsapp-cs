import { DEMO_CODE, DEMO_PLACE, demoNow, formatMinutes, historicalFixtures } from './fixtures';
import type { HrService } from './service';
import type { HrDemoState, HrErrorCode, HrHistoryDay, HrLocale, HrMe, HrPresenceCheck, HrScan, HrToday } from './types';

const messages: Record<HrErrorCode, [string, string]> = {
  offline: ['لا يوجد اتصال. اتصل بالإنترنت ثم حاول مجددًا.', 'No connection. Connect and try again.'],
  timeout_after_punch: ['تعذّر تأكيد النتيجة. أعد المحاولة بنفس الطلب.', 'The result could not be confirmed. Retry the same request.'],
  qr_expired: ['انتهت صلاحية رمز الباب. امسح الرمز الجديد.', 'This door code expired. Scan the current code.'],
  qr_invalid: ['هذا ليس رمز باب شركتك. امسح شاشة الباب.', 'This is not your company’s door code. Scan the door screen.'],
  duplicate_punch: ['سجّلت قبل قليل. انتظر حتى انتهاء مهلة التسجيل.', 'Already registered. Wait for the cooldown to finish.'],
  signature_invalid: ['تعذّر التحقق من الهاتف. حاول مجددًا أو اطلب رمز تفعيل جديدًا.', 'The phone could not be verified. Retry or ask HR for a new code.'],
  revoked: ['هذا الهاتف لم يعد مسجّلًا. اطلب رمزًا جديدًا من الموارد البشرية.', 'This phone is no longer registered. Ask HR for a new code.'],
  device_revoked: ['هذا الهاتف لم يعد مسجّلًا. اطلب رمزًا جديدًا من الموارد البشرية.', 'This phone is no longer registered. Ask HR for a new code.'],
  attendance_not_tracked: ['الحضور غير مفعّل لهذا الموظف. تواصل مع الموارد البشرية.', 'Attendance is not enabled. Contact HR.'],
  employee_inactive: ['الموظف غير نشط. تواصل مع الموارد البشرية.', 'This employee is inactive. Contact HR.'],
  subscription_inactive: ['اشتراك الشركة غير نشط. تواصل مع الموارد البشرية.', 'The company subscription is inactive. Contact HR.'],
  activation_code_invalid: ['تحقّق من رمز التفعيل المكوّن من 8 خانات.', 'Check the 8-character activation code.'],
  activation_code_expired: ['انتهت صلاحية رمز التفعيل. اطلب رمزًا جديدًا.', 'This activation code expired. Ask HR for a new one.'],
  activation_code_used: ['استُخدم هذا الرمز. اطلب رمز تفعيل جديدًا.', 'This code was already used. Ask HR for a new one.'],
  server_error: ['تعذّر الاتصال بالخدمة. حاول لاحقًا.', 'The service is unavailable. Try again later.'],
  rate_limited: ['محاولات كثيرة. انتظر 30 ثانية ثم حاول مجددًا.', 'Too many attempts. Wait 30 seconds and try again.'],
  validation_failed: ['تحقّق من البيانات المدخلة.', 'Check the supplied information.'],
  device_not_approved: ['أكمل تفعيل الهاتف وانتظر موافقة الموارد البشرية.', 'Complete activation and wait for HR approval.'],
  unauthenticated: ['فعّل هذا الهاتف باستخدام رمز الموارد البشرية.', 'Activate this phone using your HR code.'],
  presence_check_expired: ['انتهت مهلة تحقّق الحضور.', 'This presence check has ended.'],
  not_found: ['لم يعد هذا الطلب متاحًا. حدّث الصفحة.', 'This request is no longer available. Refresh the screen.'],
};
export class HrError extends Error {
  readonly status: number;
  readonly retryAfter?: number;
  constructor(public readonly code: HrErrorCode, locale: HrLocale = 'ar') {
    super(messages[code][locale === 'ar' ? 0 : 1]); this.name = 'HrError';
    this.status = ['offline', 'timeout_after_punch'].includes(code) ? 0 : code === 'server_error' ? 500 : code === 'rate_limited' ? 429 : ['device_revoked', 'unauthenticated'].includes(code) ? 401 : ['activation_code_expired', 'presence_check_expired'].includes(code) ? 410 : ['duplicate_punch', 'activation_code_used'].includes(code) ? 409 : ['employee_inactive', 'attendance_not_tracked', 'subscription_inactive', 'device_not_approved'].includes(code) ? 403 : code === 'not_found' ? 404 : 422;
    if (code === 'rate_limited') this.retryAfter = 30;
  }
}
export function normalizeActivationCode(code: string): string { return code.replace(/[\s-]/g, '').toUpperCase(); }
let requestSequence = 0;
/** Explicit mock values, never usable as real hardware signatures or door payloads. */
export function createDemoScan(auth_method: HrScan['auth_method'] = 'biometric_bound'): HrScan {
  requestSequence += 1;
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return { qr_payload: 'demo.door.not-a-real-qr', client_request_id: `${random()}${random()}-${random()}-4${random().slice(1)}-a${random().slice(1)}-${random()}${requestSequence.toString(16).padStart(8, '0')}`, auth_method, signature: 'demo-only-no-signature' };
}
export function deriveToday(state: HrDemoState, now: number): HrToday {
  const local = new Date(now + 3 * 3600000); // Fictional company has fixed Asia/Riyadh time.
  const work_date = local.toISOString().slice(0, 10);
  const punches = state.punches.filter(p => p.work_date === work_date);
  const first = punches.find(p => p.type === 'in');
  const last = punches[punches.length - 1];
  let worked = 0, opened: number | null = null;
  for (const punch of punches) {
    if (punch.type === 'in') opened = Date.parse(punch.punched_at);
    else if (opened !== null) { worked += Math.max(0, Date.parse(punch.punched_at) - opened); opened = null; }
  }
  if (opened !== null) worked += Math.max(0, now - opened);
  return { work_date, status: !last ? 'not_in' : last.type === 'in' ? 'on_duty' : 'present', in: first?.time ?? null, out: last?.type === 'out' ? last.time : null, in_minute: first?.minute ?? null, out_minute: last?.type === 'out' ? last.minute : null, worked_minutes: Math.floor(worked / 60000), late_minutes: first ? Math.max(0, first.minute - 490) : 0, next_punch_type: last?.type === 'in' ? 'out' : 'in', schedule: { name: 'Standard shift', type: 'fixed', start: '08:00', end: '17:00', night_shift: false }, punches, server_time: new Date(now).toISOString(), server_time_ms: now };
}
export function derivePending(state: HrDemoState, now: number): HrPresenceCheck[] {
  return state.presenceChecks.filter(p => p.status === 'sent' && Date.parse(p.expires_at) > now).map(p => ({ ...p, seconds_left: Math.max(0, Math.ceil((Date.parse(p.expires_at) - now) / 1000)) }));
}
export function deriveHistory(state: HrDemoState, now: number): HrHistoryDay[] {
  if (state.scenario === 'empty_history') return [];
  const today = deriveToday(state, now);
  const current: HrHistoryDay = { work_date: today.work_date, status: today.status, in: today.in, out: today.out, worked_minutes: today.worked_minutes, late_minutes: today.late_minutes, night_shift: false, punches: today.punches, demo_only: true };
  return [current, ...historicalFixtures().filter(d => d.work_date !== current.work_date)].sort((a, b) => b.work_date.localeCompare(a.work_date));
}

type Options = { read: () => HrDemoState; write: (next: HrDemoState) => void; clock?: () => number; latencyMs?: number };
export function createHrMockService({ read, write, clock = () => demoNow(read()), latencyMs = 180 }: Options): HrService {
  const fail = (code: HrErrorCode): never => { throw new HrError(code, read().locale); };
  const pause = async () => { if (latencyMs) await new Promise(resolve => setTimeout(resolve, latencyMs)); };
  const network = () => { const scenario = read().scenario; if (scenario === 'offline' || scenario === 'server_error' || scenario === 'rate_limited') fail(scenario); };
  const checkSession = (active = false) => {
    const state = read();
    if (state.activationStatus === 'revoked') fail('device_revoked');
    if (state.activationStatus === 'unregistered') fail('unauthenticated');
    if (active && state.activationStatus !== 'active') fail('device_not_approved');
    if (active && ['employee_inactive', 'attendance_not_tracked', 'subscription_inactive'].includes(state.scenario)) fail(state.scenario as HrErrorCode);
  };
  const me = (): HrMe => { const s = read(); const now = clock(); return { employee: s.employee, company: s.company, device: s.device, activation_status: s.activationStatus, settings: s.settings, server_time: new Date(now).toISOString(), server_time_ms: now }; };
  const checkCode = (code: string) => {
    const state = read();
    if (state.scenario.startsWith('activation_code_')) fail(state.scenario as HrErrorCode);
    // A revoked phone may register again; in the demo the fixture code stands in for HR's new code.
    if (state.usedCode && state.activationStatus !== 'revoked') fail('activation_code_used');
    if (normalizeActivationCode(code) !== DEMO_CODE) fail('activation_code_invalid');
  };
  const checkScan = (scan: HrScan) => {
    const state = read();
    if (['qr_expired', 'qr_invalid', 'signature_invalid'].includes(state.scenario)) fail(state.scenario as HrErrorCode);
    if (!scan.client_request_id || scan.client_request_id.length < 8) fail('validation_failed');
    if (scan.qr_payload !== 'demo.door.not-a-real-qr') fail('qr_invalid');
    if (scan.signature !== 'demo-only-no-signature') fail('signature_invalid');
  };
  return {
    async verify(code) { await pause(); network(); checkCode(code); const s = read(); write({ ...s, verifiedCode: normalizeActivationCode(code) }); return { employee: s.employee, company: s.company, expires_at: new Date(clock() + 72 * 3600000).toISOString() }; },
    async complete(code) { await pause(); network(); checkCode(code); const s = read(); if (s.verifiedCode !== normalizeActivationCode(code)) fail('validation_failed'); write({ ...s, usedCode: true, activationStatus: 'pending_first_scan', device: { ...s.device, status: 'pending_first_scan' } }); return me(); },
    async firstScan(scan) { await pause(); network(); checkSession(); if (read().activationStatus !== 'pending_first_scan') fail('validation_failed'); checkScan(scan); const s = read(); write({ ...s, activationStatus: 'pending_approval', device: { ...s.device, status: 'pending_approval' } }); return me(); },
    async approveDemoDevice() { await pause(); network(); if (read().activationStatus !== 'pending_approval') fail('validation_failed'); const s = read(); write({ ...s, activationStatus: 'active', device: { ...s.device, status: 'active', approved_at: new Date(clock()).toISOString() } }); return me(); },
    async me() { await pause(); network(); checkSession(); return me(); },
    async today() { await pause(); network(); checkSession(true); return deriveToday(read(), clock()); },
    async punch(scan) {
      await pause(); network(); checkSession(true);
      const s = read();
      // Replay is checked before cooldown or QR expiry: an accepted retry returns its original result.
      if (s.replay[scan.client_request_id]) return { punch: s.replay[scan.client_request_id] };
      checkScan(scan);
      const now = clock(); const today = deriveToday(s, now); const last = s.punches[s.punches.length - 1];
      if (last && now - Date.parse(last.punched_at) < s.settings.punch_cooldown_seconds * 1000) fail('duplicate_punch');
      const minute = Math.floor((now - Date.parse(`${today.work_date}T00:00:00+03:00`)) / 60000);
      const punch = { id: `demo-${scan.client_request_id}`, type: today.next_punch_type, work_date: today.work_date, minute, time: formatMinutes(minute), punched_at: new Date(now).toISOString(), source: 'app' as const, client_request_id: scan.client_request_id, place: DEMO_PLACE };
      const timeout = s.scenario === 'timeout_after_punch' && !s.timeoutDelivered;
      write({ ...s, punches: [...s.punches, punch], replay: { ...s.replay, [scan.client_request_id]: punch }, timeoutDelivered: s.timeoutDelivered || timeout });
      if (timeout) fail('timeout_after_punch');
      return { punch };
    },
    async history(from, to) {
      await pause(); network(); checkSession(true); const end = to ?? deriveToday(read(), clock()).work_date; const start = from ?? new Date(Date.parse(`${end}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
      const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
      if (!validDate(start) || !validDate(end) || start > end || Date.parse(end) - Date.parse(start) > 92 * 86400000) fail('validation_failed');
      const days = deriveHistory(read(), clock()).filter(d => d.work_date >= start && d.work_date <= end);
      return { from: start, to: end, days, punches: days.flatMap(d => d.punches).sort((a, b) => a.punched_at.localeCompare(b.punched_at)) };
    },
    async pending() { await pause(); network(); checkSession(true); const now = clock(); return { presence_checks: derivePending(read(), now), server_time: new Date(now).toISOString(), server_time_ms: now }; },
    async confirmPresence(id, scan) {
      await pause(); network(); checkSession(true); const s = read(); const check = s.presenceChecks.find(p => p.id === id);
      if (!check) return fail('not_found');
      if (check.status === 'confirmed') return { presence_check: check };
      if (Date.parse(check.expires_at) <= clock()) { write({ ...s, presenceChecks: s.presenceChecks.map(p => p.id === id ? { ...p, status: 'expired', seconds_left: 0 } : p) }); return fail('presence_check_expired'); }
      checkScan(scan); const confirmed: HrPresenceCheck = { ...check, status: 'confirmed', seconds_left: 0, confirmed_at: new Date(clock()).toISOString() };
      write({ ...s, presenceChecks: s.presenceChecks.map(p => p.id === id ? confirmed : p) }); return { presence_check: confirmed };
    },
    async savePushToken() { await pause(); network(); checkSession(); return { saved: true }; },
    async logout() { await pause(); network(); const s = read(); write({ ...s, activationStatus: 'unregistered', device: { ...s.device, status: 'unregistered', approved_at: null }, usedCode: false, verifiedCode: null, presenceChecks: [], replay: {}, scenario: 'new' }); },
  };
}
