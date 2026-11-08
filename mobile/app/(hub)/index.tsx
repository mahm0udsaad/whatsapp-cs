import { Redirect } from "expo-router";
import { HUB_HOME } from "../../lib/navigation";

/** Merchant pairing gates merchant screens, not the shared Hub shell or HR. */
export default function HubIndex() {
  return <Redirect href={HUB_HOME} />;
}
