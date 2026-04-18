import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { supabase } from "../lib/supabase";
import { loadTeamMemberships } from "../lib/auth";
import {
  loadActiveTenant,
  persistActiveTenant,
  useSessionStore,
} from "../lib/session-store";
import { isManager } from "../lib/roles";

type Dest = "(auth)/login" | "(app)/inbox" | "(app)/overview";

export default function Index() {
  const [dest, setDest] = useState<Dest | null>(null);
  const setActiveMember = useSessionStore((s) => s.setActiveMember);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        setDest("(auth)/login");
        return;
      }
      try {
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
        // Managers land on Overview; agents on Inbox.
        setDest(isManager(match) ? "(app)/overview" : "(app)/inbox");
      } catch {
        setDest("(auth)/login");
      }
    })();
  }, [setActiveMember]);

  if (!dest) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <Redirect href={`/${dest}`} />;
}
