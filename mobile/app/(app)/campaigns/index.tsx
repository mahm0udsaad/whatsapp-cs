import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { managerColors } from "../../../components/manager-ui";

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
        style={styles.channelCard}
      >
        <View style={[styles.channelCardOrb, { backgroundColor: `${color}12` }]} />
        <View style={styles.channelCardRow}>
          <View
            style={[styles.channelIconWrap, { backgroundColor: color }]}
          >
            <Ionicons name={icon} size={30} color="#fff" />
          </View>
          <View style={styles.channelContent}>
            <View style={styles.channelHeaderRow}>
              <View
                style={[styles.channelPill, { backgroundColor: `${color}12` }]}
              >
                <Text
                  style={[styles.channelPillText, { color }]}
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
              style={styles.channelTitle}
            >
              {title}
            </Text>
            <Text
              style={styles.channelSubtitle}
            >
              {subtitle}
            </Text>
          </View>
        </View>
        <View style={styles.channelFooterRow}>
          <Text style={[styles.channelFooterAction, { color }]}>
            افتح الإدارة
          </Text>
          <View style={styles.channelFooterMeta}>
            <View style={[styles.channelFooterDot, { backgroundColor: color }]} />
            <Text style={styles.channelFooterText}>
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
      style={styles.screen}
      edges={["left", "right"]}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.scrollContent}
      >
        <View
          style={styles.heroCard}
        >
          <View style={styles.heroOrbTop} />
          <View style={styles.heroOrbBottom} />
          <View style={styles.heroRow}>
            <View style={styles.heroContent}>
              <View style={styles.heroPill}>
                <Text
                  style={styles.heroPillText}
                >
                  مركز التسويق
                </Text>
              </View>
              <Text
                style={styles.heroTitle}
              >
                الحملات والقنوات
              </Text>
              <Text
                style={styles.heroSubtitle}
              >
                اختر القناة المناسبة للنشر أو الإعلانات أو الرسائل الجماعية، ثم
                تابع الأداء من شاشة واحدة.
              </Text>
            </View>
            <View style={styles.heroIconWrap}>
              <Ionicons name="megaphone-outline" size={26} color="#FFFFFF" />
            </View>
          </View>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCard}>
              <Text
                style={styles.heroStatValue}
              >
                3
              </Text>
              <Text
                style={styles.heroStatLabel}
              >
                قنوات نشطة
              </Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text
                style={styles.heroStatValue}
              >
                الآن
              </Text>
              <Text
                style={styles.heroStatLabel}
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: managerColors.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    rowGap: 16,
  },
  heroCard: {
    overflow: "hidden",
    borderRadius: 32,
    backgroundColor: managerColors.brand,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  heroOrbTop: {
    position: "absolute",
    right: -32,
    top: -32,
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroOrbBottom: {
    position: "absolute",
    left: -40,
    bottom: 0,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(255,201,40,0.16)",
  },
  heroRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: 16,
  },
  heroContent: {
    flex: 1,
  },
  heroPill: {
    alignSelf: "flex-end",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.82)",
  },
  heroTitle: {
    marginTop: 12,
    textAlign: "right",
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroSubtitle: {
    marginTop: 8,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 24,
    color: "rgba(255,255,255,0.82)",
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroStatsRow: {
    marginTop: 20,
    flexDirection: "row-reverse",
    columnGap: 8,
  },
  heroStatCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  heroStatValue: {
    textAlign: "right",
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroStatLabel: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
  },
  channelCard: {
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: managerColors.border,
    backgroundColor: "#FCFEFC",
    padding: 16,
    shadowColor: "#273B9A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  channelCardOrb: {
    position: "absolute",
    left: -24,
    top: 20,
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  channelCardRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 16,
  },
  channelIconWrap: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  channelContent: {
    flex: 1,
  },
  channelHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 12,
  },
  channelPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  channelPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  channelTitle: {
    marginTop: 12,
    textAlign: "right",
    fontSize: 24,
    fontWeight: "700",
    color: managerColors.ink,
  },
  channelSubtitle: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 24,
    color: managerColors.muted,
  },
  channelFooterRow: {
    marginTop: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  channelFooterAction: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
  },
  channelFooterMeta: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 6,
  },
  channelFooterDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  channelFooterText: {
    fontSize: 12,
    color: managerColors.muted,
  },
});
