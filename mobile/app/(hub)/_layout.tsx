import { Redirect, Stack } from "expo-router";
import { useSessionStore } from "../../lib/session-store";

export default function HubLayout() {
  // Guard: the Hub group must never render without an active member.
  const member = useSessionStore((s) => s.activeMember);
  if (!member) {
    return <Redirect href="/(auth)/login" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
