import { Image, Pressable, Text, View, SafeAreaView } from "../../components/tw";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  persistActiveGateway,
  useSessionStore,
  type Gateway,
} from "../../lib/session-store";
import { isManager } from "../../lib/roles";
import { managerColors, softShadow } from "../../components/manager-ui";

export default function GatewaySelectScreen() {
  const member = useSessionStore((s) => s.activeMember);
  const setActiveGateway = useSessionStore((s) => s.setActiveGateway);
  const manager = isManager(member);

  async function choose(gateway: Gateway) {
    setActiveGateway(gateway);
    await persistActiveGateway(gateway);
    if (gateway === "hub") {
      router.replace("/(hub)");
    } else {
      router.replace(manager ? "/(app)/overview" : "/(app)/inbox");
    }
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: managerColors.bg }}>
      <View className="flex-1 justify-center px-6">
        <View className="mb-10 items-center">
          <Image
            source={require("../../assets/logo.png")}
            style={{ width: 88, height: 88, marginBottom: 16 }}
            resizeMode="contain"
          />
          <Text className="text-2xl font-bold" style={{ color: managerColors.ink }}>
            اختر الخدمة
          </Text>
          <Text className="mt-1 text-sm" style={{ color: managerColors.muted }}>
            يمكنك التبديل بينهما في أي وقت
          </Text>
        </View>

        <GatewayCard
          title="نِحجز بوت"
          subtitle="محادثات واتساب والحملات التسويقية وإدارة الفريق"
          icon="chatbubbles"
          onPress={() => choose("bot")}
        />

        {manager ? (
          <GatewayCard
            title="نِحجز هَب"
            subtitle="الحجوزات والخدمات والمواعيد وفريق العمل"
            icon="calendar"
            onPress={() => choose("hub")}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function GatewayCard({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-4 flex-row-reverse items-center gap-4 rounded-[24px] border bg-white p-5"
      style={[{ borderColor: managerColors.border }, softShadow]}
    >
      <View
        className="h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: managerColors.brandSoft }}
      >
        <Ionicons name={icon} size={26} color={managerColors.brand} />
      </View>
      <View className="flex-1">
        <Text className="text-right text-lg font-bold" style={{ color: managerColors.ink }}>
          {title}
        </Text>
        <Text className="mt-1 text-right text-xs leading-5" style={{ color: managerColors.muted }}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-back" size={22} color={managerColors.muted} />
    </Pressable>
  );
}
