import { Redirect } from "expo-router";

// The product is WhatsApp-first: campaigns go straight to WhatsApp campaigns.
// The old channel hub (Instagram / Facebook via Meta ads) is retired — the
// /campaigns/meta screens still exist for older app builds but are no longer
// reachable from here.
export default function CampaignsHubScreen() {
  return <Redirect href="/(app)/campaigns/whatsapp" />;
}
