import { Stack } from "expo-router";
import { HrUiProvider } from "../../../../features/hr/ui";

/** Attendance stack. HR activation is independent of merchant pairing. */
export default function HrLayout() {
  return (
    <HrUiProvider routeBase="/(hub)/(tabs)/hr">
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="scan" options={{ animation: "slide_from_bottom", gestureEnabled: false }} />
        <Stack.Screen name="result" options={{ animation: "fade", gestureEnabled: false }} />
      </Stack>
    </HrUiProvider>
  );
}
