import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack, useGlobalSearchParams, usePathname } from "expo-router";
import { useSessionStore, loadActiveTenant, persistActiveTenant } from "../../lib/session-store";
import { getSession, loadTeamMemberships } from "../../lib/auth";
import { captureException } from "../../lib/observability";
import { managerColors } from "../../components/manager-ui";

export default function HubLayout() {
  const member = useSessionStore((state) => state.activeMember);
  const pathname = usePathname();
  const { code } = useGlobalSearchParams<{ code?: string }>();
  const [hydrated, setHydrated] = useState(!!member);

  // Cold links bypass app/index.tsx: hydrate in place, preserving the route.
  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    void (async () => {
      try {
        const session = await getSession();
        if (!session?.user) return;
        const memberships = await loadTeamMemberships(session.user.id);
        const savedId = await loadActiveTenant();
        const active = memberships.find((item) => item.id === savedId) ?? memberships[0];
        if (active && !cancelled) {
          await persistActiveTenant(active.id);
          if (!cancelled) useSessionStore.setState({ activeMember: active, activeGateway: "hub" });
        }
      } catch (error) {
        captureException(error, { source: "hub-session-bootstrap" });
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [hydrated]);

  if (!hydrated) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: managerColors.bg }}><ActivityIndicator color={managerColors.brand} /></View>;
  if (!member) return <Redirect href={{ pathname: "/(auth)/login", params: { returnTo: pathname + (typeof code === "string" ? `?code=${encodeURIComponent(code)}` : "") } }} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
