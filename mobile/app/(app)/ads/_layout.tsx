import { Stack } from "expo-router";
import { managerColors } from "../../../components/manager-ui";

export default function AdsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: managerColors.bg },
      }}
    />
  );
}
