import type { HrDemoState, HrHistoryDay, HrPlace, HrPunch, HrScenario } from './types';

export const DEMO_CODE = 'K7QM4XHT';
export const DEMO_DATE = '2026-11-02';
export const DEMO_START = Date.parse('2026-11-02T05:03:00Z');
export const DEMO_PLACE: HrPlace = { id: 3, name: 'المكتب الرئيسي', name_ar: 'المكتب الرئيسي', name_en: 'Head office' };
export const HR_SCENARIOS: HrScenario[] = ['new', 'pending_first_scan', 'pending_approval', 'active', 'on_duty', 'completed', 'presence', 'history', 'empty_history', 'offline', 'timeout_after_punch', 'duplicate_punch', 'qr_expired', 'qr_invalid', 'signature_invalid', 'revoked', 'employee_inactive', 'attendance_not_tracked', 'subscription_inactive', 'activation_code_invalid', 'activation_code_expired', 'activation_code_used', 'server_error', 'rate_limited'];

export function formatMinutes(minute: number): string {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}${minute >= 1440 ? ' +1' : ''}`;
}
export function fixturePunch(date: string, minute: number, type: 'in' | 'out'): HrPunch {
  const id = `demo-${date}-${minute}-${type}`;
  return { id, type, work_date: date, minute, time: formatMinutes(minute), punched_at: new Date(Date.parse(`${date}T00:00:00+03:00`) + minute * 60000).toISOString(), source: 'app', client_request_id: id, place: DEMO_PLACE };
}
export function createInitialHrState(wallNow = Date.now()): HrDemoState {
  return {
    activationStatus: 'unregistered',
    employee: { id: 42, code: 'EMP-0042', name: 'أحمد سالم', name_ar: 'أحمد سالم', name_en: 'Ahmed Salem', job_title: 'Accountant' },
    company: { name: 'شركة الأفق للتجارة', name_ar: 'شركة الأفق للتجارة', name_en: 'Al Ofoq Trading Co.', timezone: 'Asia/Riyadh', locale: 'ar' },
    device: { id: 17, status: 'unregistered', platform: 'demo', model: 'Demo phone', key_algorithm: 'demo-only', approved_at: null },
    settings: { qr_step_seconds: 15, punch_cooldown_seconds: 120, presence_check_window: 10 },
    locale: 'ar', theme: 'light', punches: [], presenceChecks: [], scenario: 'new',
    clockBase: DEMO_START, clockStartedAt: wallNow, usedCode: false, verifiedCode: null, replay: {}, timeoutDelivered: false,
  };
}
export function demoNow(state: HrDemoState, wallNow = Date.now()): number {
  return state.clockBase + Math.max(0, wallNow - state.clockStartedAt);
}
export function createScenario(scenario: HrScenario, previous?: HrDemoState, wallNow = Date.now()): HrDemoState {
  const state = createInitialHrState(wallNow);
  state.locale = previous?.locale ?? 'ar'; state.theme = previous?.theme ?? 'light'; state.scenario = scenario;
  state.activationStatus = scenario === 'new' || scenario.startsWith('activation_code_') ? 'unregistered' : scenario === 'pending_first_scan' || scenario === 'pending_approval' || scenario === 'revoked' ? scenario : 'active';
  state.device.status = state.activationStatus;
  state.device.approved_at = state.activationStatus === 'active' ? new Date(DEMO_START - 60000).toISOString() : null;
  state.usedCode = state.activationStatus !== 'unregistered';
  if (['on_duty', 'presence', 'history', 'completed', 'duplicate_punch'].includes(scenario)) {
    state.punches = [fixturePunch(DEMO_DATE, 483, 'in')];
    if (scenario !== 'duplicate_punch') state.clockBase = Date.parse('2026-11-02T08:40:00Z');
  }
  if (scenario === 'completed') { state.punches.push(fixturePunch(DEMO_DATE, 1026, 'out')); state.clockBase = Date.parse('2026-11-02T14:10:00Z'); }
  if (scenario === 'presence') {
    state.presenceChecks = [{ id: 9, status: 'sent', sent_at: new Date(state.clockBase - 60000).toISOString(), expires_at: new Date(state.clockBase + 540000).toISOString(), seconds_left: 540, confirmed_at: null }];
  }
  return state;
}
export function historicalFixtures(): HrHistoryDay[] {
  const rows: [string, HrHistoryDay['status'], number | null, number | null, number, boolean][] = [
    ['2026-11-01', 'present', 476, 1024, 0, false],
    ['2026-10-31', 'weekend', null, null, 0, false],
    ['2026-10-30', 'weekend', null, null, 0, false],
    ['2026-10-29', 'late', 501, 1030, 11, false],
    ['2026-10-28', 'leave', null, null, 0, false],
    ['2026-10-27', 'missing', 479, null, 0, false],
    ['2026-10-26', 'present', 1322, 1810, 0, true],
  ];
  return rows.map(([date, status, start, end, late, night]) => ({ work_date: date, status, in: start === null ? null : formatMinutes(start), out: end === null ? null : formatMinutes(end), worked_minutes: start !== null && end !== null ? end - start : 0, late_minutes: late, night_shift: night, punches: [...(start !== null ? [fixturePunch(date, start, 'in')] : []), ...(end !== null ? [fixturePunch(date, end, 'out')] : [])], demo_only: true }));
}
