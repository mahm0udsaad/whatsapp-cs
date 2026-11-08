import { Redirect } from "expo-router";
import { useSessionStore } from "../../lib/session-store";

/** Compatibility route for links saved before Hub became the default. */
export default function GatewaySelectScreen() {
  const member = useSessionStore((state) => state.activeMember);
  return <Redirect href={member ? "/(hub)" : "/(auth)/login"} />;
}
