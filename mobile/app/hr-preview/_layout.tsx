import { Redirect, Stack } from "expo-router";
import { HrUiProvider, hrDemoControlsEnabled } from "../../features/hr/ui";

/**
 * Sign-in-free walkthrough of the HR demo for dev/preview builds
 * (open whatsapp-cs-agent://hr-preview). Uses its own isolated demo identity.
 */
export default function HrPreviewLayout() {
  if (!hrDemoControlsEnabled) return <Redirect href="/" />;
  return (
    <HrUiProvider routeBase="/hr-preview" identity="hr-preview">
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="scan" options={{ animation: "slide_from_bottom", gestureEnabled: false }} />
        <Stack.Screen name="result" options={{ animation: "fade", gestureEnabled: false }} />
      </Stack>
    </HrUiProvider>
  );
}
