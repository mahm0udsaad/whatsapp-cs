import { useEffect, useState } from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { Redirect } from "expo-router";
import { supabase } from "../lib/supabase";
import { loadTeamMemberships } from "../lib/auth";
import {
  loadActiveTenant,
  persistActiveTenant,
  useSessionStore,
} from "../lib/session-store";
import { captureException } from "../lib/observability";

type Dest = "(auth)/login" | "(hub)";

// Matches splash backgroundColor in app.json — keeps the boot transition
// flicker-free while we resolve the persisted Supabase session.
const SPLASH_BG = "#1e3a8a";

export default function Index() {
  const [dest, setDest] = useState<Dest | null>(null);
  const setActiveMember = useSessionStore((s) => s.setActiveMember);
  const setActiveGateway = useSessionStore((s) => s.setActiveGateway);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user) {
          setDest("(auth)/login");
          return;
        }
        const memberships = await loadTeamMemberships(data.session.user.id);
        if (memberships.length === 0) {
          await supabase.auth.signOut();
          setDest("(auth)/login");
          return;
        }
        const savedId = await loadActiveTenant();
        const match = memberships.find((m) => m.id === savedId) ?? memberships[0];
        setActiveMember(match);
        await persistActiveTenant(match.id);

        // A persisted Bot choice must not override Hub as the launch destination.
        setActiveGateway("hub");
        setDest("(hub)");
      } catch (err) {
        captureException(err, { source: "session-bootstrap" });
        setDest("(auth)/login");
      }
    })();
  }, [setActiveMember, setActiveGateway]);

  if (!dest) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: SPLASH_BG,
        }}
      >
        <Image
          source={require("../assets/logo-ui.png")}
          style={{ width: 140, height: 140, marginBottom: 32 }}
          resizeMode="contain"
        />
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }
  return <Redirect href={`/${dest}`} />;
}
