import { create } from 'zustand';
import { createInitialHrState, createScenario } from './fixtures';
import { createHrMockService } from './mock-service';
import type { HrService } from './service';
import type { HrDemoState, HrLocale, HrScenario, HrTheme } from './types';

type Store = { sessions: Record<string, HrDemoState>; wallNow: number; revision: number };
export const useHrDemoStore = create<Store>(() => ({ sessions: {}, wallNow: Date.now(), revision: 0 }));
const services = new Map<string, HrService>();
const initialStates = new Map<string, HrDemoState>();

export function getHrDemoState(identity: string): HrDemoState {
  const existing = useHrDemoStore.getState().sessions[identity];
  if (existing) return existing;
  // Stable fallback lets the initial render read state without mutating a subscribed store.
  if (!initialStates.has(identity)) initialStates.set(identity, createInitialHrState());
  return initialStates.get(identity)!;
}
export function writeHrDemoState(identity: string, state: HrDemoState) {
  useHrDemoStore.setState(s => ({ sessions: { ...s.sessions, [identity]: state } }));
}
export function getHrDemoService(identity: string): HrService {
  if (!services.has(identity)) {
    services.set(identity, createHrMockService({ read: () => getHrDemoState(identity), write: next => writeHrDemoState(identity, next) }));
  }
  return services.get(identity)!;
}
export function setHrScenario(identity: string, scenario: HrScenario) {
  writeHrDemoState(identity, createScenario(scenario, getHrDemoState(identity)));
}
export function resetHrDemo(identity: string) {
  const previous = getHrDemoState(identity);
  writeHrDemoState(identity, { ...createInitialHrState(), locale: previous.locale, theme: previous.theme });
}
export function setHrLocale(identity: string, locale: HrLocale) { writeHrDemoState(identity, { ...getHrDemoState(identity), locale }); }
export function setHrTheme(identity: string, theme: HrTheme) { writeHrDemoState(identity, { ...getHrDemoState(identity), theme }); }
export function clearHrDemoSessions() {
  initialStates.clear(); services.clear();
  useHrDemoStore.setState(s => ({ sessions: {}, revision: s.revision + 1 }));
}
let tickerUsers = 0;
let ticker: ReturnType<typeof setInterval> | undefined;
/** One clock for every mounted HR screen/component; resume uses current elapsed wall time. */
export function subscribeHrClock() {
  tickerUsers += 1;
  if (!ticker) ticker = setInterval(() => useHrDemoStore.setState({ wallNow: Date.now() }), 1000);
  return () => { tickerUsers = Math.max(0, tickerUsers - 1); if (tickerUsers === 0 && ticker) { clearInterval(ticker); ticker = undefined; } };
}
export function refreshHrClock() { useHrDemoStore.setState({ wallNow: Date.now() }); }
/** Demo control: HR sends a new presence check (window from company settings). */
export function triggerHrPresence(identity: string, wallNow = Date.now()) {
  const state = getHrDemoState(identity);
  const now = state.clockBase + Math.max(0, wallNow - state.clockStartedAt);
  const window = state.settings.presence_check_window * 60;
  const id = Math.max(100, ...state.presenceChecks.map(p => p.id)) + 1;
  writeHrDemoState(identity, { ...state, presenceChecks: [...state.presenceChecks, { id, status: 'sent', sent_at: new Date(now).toISOString(), expires_at: new Date(now + window * 1000).toISOString(), seconds_left: window, confirmed_at: null }] });
  return id;
}
/** Demo control: move the fictional company clock forward (e.g. past the punch cooldown). */
export function advanceHrClock(identity: string, ms: number) {
  const state = getHrDemoState(identity);
  writeHrDemoState(identity, { ...state, clockBase: state.clockBase + ms });
  refreshHrClock();
}
