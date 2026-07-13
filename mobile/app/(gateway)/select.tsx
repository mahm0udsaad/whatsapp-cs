import { Image, Pressable, ScrollView, Text, View, SafeAreaView } from "../../components/tw";
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
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="grow justify-center px-6 py-10"
      >
        <View className="w-full self-center" style={{ maxWidth: 430 }}>
          <View className="mb-8 items-center">
            <View
              className="mb-5 items-center justify-center rounded-[34px] border"
              style={{ width: 116, height: 116, backgroundColor: managerColors.brandSoft, borderColor: managerColors.border, ...softShadow }}
            >
              <Image
                source={require("../../assets/logo.png")}
                style={{ width: 92, height: 92, borderRadius: 28, backgroundColor: managerColors.brand }}
                resizeMode="contain"
              />
            </View>
            <Text className="text-[13px] font-extrabold" style={{ color: managerColors.brand }}>
              أهلاً بك في نِحجز
            </Text>
            <Text className="mt-1 text-center text-[30px] font-extrabold" style={{ color: managerColors.ink }}>
              اختر الخدمة
            </Text>
            <Text className="mt-2 text-center text-[15px] leading-6" style={{ color: managerColors.muted }}>
              اختر مساحة العمل التي تريد فتحها الآن
            </Text>
          </View>

          <GatewayCard
            title="نِحجز بوت"
            subtitle="محادثات واتساب والحملات التسويقية وإدارة الفريق"
            icon="chatbubbles"
            actionLabel="فتح نِحجز بوت"
            onPress={() => choose("bot")}
          />

          {manager ? (
            <GatewayCard
              title="نِحجز هَب"
              subtitle="الحجوزات والخدمات والمواعيد وفريق العمل"
              icon="calendar"
              actionLabel="فتح نِحجز هَب"
              onPress={() => choose("hub")}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function GatewayCard({
  title,
  subtitle,
  icon,
  actionLabel,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-4 rounded-[26px] border bg-white p-5"
      style={[{ borderColor: managerColors.border }, softShadow]}
    >
      <View className="flex-row-reverse items-center gap-4">
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
      </View>
      <View
        className="mt-5 flex-row-reverse items-center justify-center gap-2 rounded-[14px] py-3"
        style={{ backgroundColor: managerColors.brand }}
      >
        <Text className="text-sm font-bold text-white">{actionLabel}</Text>
        <Ionicons name="arrow-back" size={17} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}
