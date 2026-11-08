import { createInitialHrState, createScenario, demoNow, historicalFixtures } from '../features/hr/fixtures';
import { createDemoScan, createHrMockService, derivePending, deriveToday, normalizeActivationCode } from '../features/hr/mock-service';
import type { HrScenario } from '../features/hr/types';

function setup(scenario: HrScenario = 'new') {
  let state = createScenario(scenario, undefined, 0);
  let now = state.clockBase;
  const service = createHrMockService({ read: () => state, write: next => { state = next; }, clock: () => now, latencyMs: 0 });
  return { service, state: () => state, advance: (ms: number) => { now += ms; }, now: () => now };
}

describe('HR demo employee contract', () => {
  it('normalizes code and enforces verification, first scan, approval order', async () => {
    const t = setup();
    expect(normalizeActivationCode(' k7qm-4xht ')).toBe('K7QM4XHT');
    await expect(t.service.complete('K7QM4XHT')).rejects.toMatchObject({ code: 'validation_failed' });
    await t.service.verify(' k7qm-4xht ');
    expect(t.state().usedCode).toBe(false);
    await t.service.complete('K7QM4XHT');
    expect(t.state().activationStatus).toBe('pending_first_scan');
    await expect(t.service.punch(createDemoScan())).rejects.toMatchObject({ code: 'device_not_approved' });
    await expect(t.service.approveDemoDevice()).rejects.toMatchObject({ code: 'validation_failed' });
    await t.service.firstScan(createDemoScan());
    expect(t.state().activationStatus).toBe('pending_approval');
    await t.service.approveDemoDevice();
    expect(t.state().activationStatus).toBe('active');
    await expect(t.service.verify('K7QM4XHT')).rejects.toMatchObject({ code: 'activation_code_used' });
  });

  it('records one punch on an ambiguous timeout, then returns original result on retry', async () => {
    const t = setup('timeout_after_punch'); const scan = createDemoScan();
    await expect(t.service.punch(scan)).rejects.toMatchObject({ code: 'timeout_after_punch' });
    expect(t.state().punches).toHaveLength(1);
    const retry = await t.service.punch(scan);
    expect(retry.punch.type).toBe('in');
    expect(t.state().punches).toHaveLength(1);
    await expect(t.service.punch(createDemoScan())).rejects.toMatchObject({ code: 'duplicate_punch' });
    t.advance(120000);
    expect((await t.service.punch(createDemoScan())).punch.type).toBe('out');
    expect(t.state().punches).toHaveLength(2);
  });

  it('confirms presence idempotently without changing attendance', async () => {
    const t = setup('presence'); const before = [...t.state().punches];
    const check = await t.service.confirmPresence(9, createDemoScan());
    t.advance(600000);
    const retry = await t.service.confirmPresence(9, createDemoScan());
    expect(retry).toEqual(check);
    expect(t.state().punches).toEqual(before);
    expect((await t.service.pending()).presence_checks).toHaveLength(0);
  });

  it('expires a presence check after background time and rejects confirmation', async () => {
    const t = setup('presence');
    expect(derivePending(t.state(), t.now())[0].seconds_left).toBe(540);
    t.advance(541000);
    expect(derivePending(t.state(), t.now())).toEqual([]);
    await expect(t.service.confirmPresence(9, createDemoScan())).rejects.toMatchObject({ code: 'presence_check_expired' });
    expect(t.state().presenceChecks[0].status).toBe('expired');
    expect(t.state().punches).toHaveLength(1);
  });

  it('rejects offline punching without enqueueing or changing local attendance', async () => {
    const t = setup('offline');
    await expect(t.service.punch(createDemoScan())).rejects.toMatchObject({ code: 'offline' });
    expect(t.state().punches).toHaveLength(0);
  });

  it.each(['revoked', 'employee_inactive', 'attendance_not_tracked', 'subscription_inactive'] as HrScenario[])('blocks an unavailable employee: %s', async scenario => {
    const t = setup(scenario);
    await expect(t.service.punch(createDemoScan())).rejects.toMatchObject({ code: scenario === 'revoked' ? 'device_revoked' : scenario });
    expect(t.state().punches).toHaveLength(0);
  });

  it('retains the work date and +1 for overnight history, while validating range', async () => {
    const t = setup('history');
    const history = await t.service.history('2026-10-26', '2026-11-02');
    const night = history.days.find(d => d.night_shift)!;
    expect(night.out).toBe('06:10 +1');
    expect(night.punches[1].work_date).toBe('2026-10-26');
    expect(night.worked_minutes).toBe(488);
    await expect(t.service.history('2026-01-01', '2026-11-02')).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(t.service.history('2026-11-03', '2026-11-02')).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(t.service.history('2026-02-30', '2026-03-01')).rejects.toMatchObject({ code: 'validation_failed' });
    expect((await t.service.history('2026-09-01', '2026-09-02')).days).toEqual([]);
  });

  it('computes the running demo clock and worked time from consistent instants', () => {
    const s = createInitialHrState(1000);
    expect(demoNow(s, 61000)).toBe(s.clockBase + 60000);
    const t = setup('on_duty');
    const today = deriveToday(t.state(), t.now());
    expect(today.worked_minutes).toBe(217);
    expect(today.next_punch_type).toBe('out');
    expect(historicalFixtures().every(d => d.demo_only)).toBe(true);
  });

  it('returns to activation on HR logout without erasing counted history', async () => {
    const t = setup('on_duty');
    await t.service.logout();
    expect(t.state().activationStatus).toBe('unregistered');
    expect(t.state().punches).toHaveLength(1);
    await expect(t.service.today()).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
