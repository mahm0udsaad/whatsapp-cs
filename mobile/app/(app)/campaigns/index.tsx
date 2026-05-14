import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { managerColors, softShadow } from "../../../components/manager-ui";

interface ChannelCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
}

function ChannelCard({ icon, title, subtitle, color, onPress }: ChannelCardProps) {
  return (
    <Pressable onPress={onPress}>
      <View
        className="overflow-hidden rounded-[28px] border bg-[#FCFEFC] p-4"
        style={{ borderColor: managerColors.border, ...softShadow }}
      >
        <View
          className="absolute -left-6 top-5 h-24 w-24 rounded-full"
          style={{ backgroundColor: `${color}12` }}
        />
        <View className="flex-row-reverse items-center gap-4">
          <View
            className="h-16 w-16 items-center justify-center rounded-[20px]"
            style={{ backgroundColor: color }}
          >
            <Ionicons name={icon} size={30} color="#fff" />
          </View>
          <View className="flex-1">
            <View className="flex-row-reverse items-center justify-between gap-3">
              <View
                className="rounded-full px-2.5 py-1"
                style={{ backgroundColor: `${color}12` }}
              >
                <Text
                  className="text-[11px] font-semibold"
                  style={{ color }}
                >
                  قناة جاهزة
                </Text>
              </View>
              <Ionicons
                name="chevron-back"
                size={20}
                color={managerColors.muted}
              />
            </View>
            <Text
              className="mt-3 text-right text-[24px] font-bold"
              style={{ color: managerColors.ink }}
            >
              {title}
            </Text>
            <Text
              className="mt-1 text-right text-[14px] leading-6"
              style={{ color: managerColors.muted }}
            >
              {subtitle}
            </Text>
          </View>
        </View>
        <View className="mt-4 flex-row-reverse items-center justify-between">
          <Text className="text-right text-xs font-semibold" style={{ color }}>
            افتح الإدارة
          </Text>
          <View className="flex-row-reverse items-center gap-1.5">
            <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            <Text className="text-[12px]" style={{ color: managerColors.muted }}>
              منشورات وحملات وتقارير
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function CampaignsHubScreen() {
  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: managerColors.bg }}
      edges={["left", "right"]}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="px-4 pb-8 pt-4 gap-4"
      >
        <View
          className="overflow-hidden rounded-[32px] px-5 py-6"
          style={{ backgroundColor: managerColors.brand }}
        >
          <View
            className="absolute -right-8 -top-8 h-28 w-28 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
          />
          <View
            className="absolute -left-10 bottom-0 h-32 w-32 rounded-full"
            style={{ backgroundColor: "rgba(255,201,40,0.16)" }}
          />
          <View className="flex-row-reverse items-start justify-between gap-4">
            <View className="flex-1">
              <View className="self-end rounded-full bg-white/10 px-3 py-1">
                <Text
                  className="text-[11px] font-semibold"
                  style={{ color: "rgba(255,255,255,0.82)" }}
                >
                  مركز التسويق
                </Text>
              </View>
              <Text
                className="mt-3 text-right text-[28px] font-bold"
                style={{ color: "#FFFFFF" }}
              >
                الحملات والقنوات
              </Text>
              <Text
                className="mt-2 text-right text-[14px] leading-6"
                style={{ color: "rgba(255,255,255,0.82)" }}
              >
                اختر القناة المناسبة للنشر أو الإعلانات أو الرسائل الجماعية، ثم
                تابع الأداء من شاشة واحدة.
              </Text>
            </View>
            <View className="h-14 w-14 items-center justify-center rounded-[20px] bg-white/12">
              <Ionicons name="megaphone-outline" size={26} color="#FFFFFF" />
            </View>
          </View>
          <View className="mt-5 flex-row-reverse gap-2">
            <View className="flex-1 rounded-[18px] bg-white/10 px-4 py-3">
              <Text
                className="text-right text-xl font-bold"
                style={{ color: "#FFFFFF" }}
              >
                3
              </Text>
              <Text
                className="mt-1 text-right text-xs"
                style={{ color: "rgba(255,255,255,0.72)" }}
              >
                قنوات نشطة
              </Text>
            </View>
            <View className="flex-1 rounded-[18px] bg-white/10 px-4 py-3">
              <Text
                className="text-right text-xl font-bold"
                style={{ color: "#FFFFFF" }}
              >
                الآن
              </Text>
              <Text
                className="mt-1 text-right text-xs"
                style={{ color: "rgba(255,255,255,0.72)" }}
              >
                إدارة المحتوى والحملات
              </Text>
            </View>
          </View>
        </View>

        <ChannelCard
          icon="logo-instagram"
          title="Instagram"
          subtitle="انشر منشورات وأدِر حملاتك على Instagram"
          color="#E1306C"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push("/(app)/campaigns/meta?platform=instagram" as any)}
        />

        <ChannelCard
          icon="logo-facebook"
          title="Facebook"
          subtitle="انشر منشورات وأدِر حملاتك على Facebook"
          color="#1877F2"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push("/(app)/campaigns/meta?platform=facebook" as any)}
        />

        <ChannelCard
          icon="logo-whatsapp"
          title="WhatsApp"
          subtitle="حملات الرسائل الجماعية للعملاء"
          color="#25D366"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push("/(app)/campaigns/whatsapp" as any)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
