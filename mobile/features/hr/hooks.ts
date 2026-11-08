import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { useSessionStore } from '../../lib/session-store';
import { demoNow } from './fixtures';
import { deriveHistory, derivePending, deriveToday } from './mock-service';
import { advanceHrClock, clearHrDemoSessions, getHrDemoService, triggerHrPresence, getHrDemoState, refreshHrClock, resetHrDemo, setHrLocale, setHrScenario, setHrTheme, subscribeHrClock, useHrDemoStore } from './store';
import type { HrLocale, HrScenario, HrTheme } from './types';

// Authentication changes invalidate all displayed employee data, including pending operations.
useSessionStore.subscribe((state, previous) => {
  if (state.activeMember?.id !== previous.activeMember?.id) clearHrDemoSessions();
});

export function useHrDemo(identityOverride?: string) {
  const memberId = useSessionStore(s => s.activeMember?.id);
  const identity = identityOverride ?? memberId ?? 'signed-out-hr-demo';
  const sessions = useHrDemoStore(s => s.sessions);
  const wallNow = useHrDemoStore(s => s.wallNow);
  const revision = useHrDemoStore(s => s.revision);
  const state = sessions[identity] ?? getHrDemoState(identity);
  const now = demoNow(state, wallNow);
  const service = useMemo(() => getHrDemoService(identity), [identity, revision]);
  useEffect(() => {
    const stop = subscribeHrClock();
    const subscription = AppState.addEventListener('change', value => { if (value === 'active') refreshHrClock(); });
    return () => { stop(); subscription.remove(); };
  }, []);
  return {
    state, now, service,
    today: deriveToday(state, now), pending: derivePending(state, now), history: deriveHistory(state, now),
    setScenario: (scenario: HrScenario) => setHrScenario(identity, scenario),
    reset: () => resetHrDemo(identity),
    setLocale: (locale: HrLocale) => setHrLocale(identity, locale),
    setTheme: (theme: HrTheme) => setHrTheme(identity, theme),
    triggerPresence: () => triggerHrPresence(identity),
    advanceClock: (ms: number) => advanceHrClock(identity, ms),
  };
}
