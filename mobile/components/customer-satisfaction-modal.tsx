import { Ionicons } from "@expo/vector-icons";
import { Modal, StyleSheet } from "react-native";
import type { SatisfactionAnalysisResponse } from "../lib/api";
import { managerColors } from "./manager-ui";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from "./tw";

interface CustomerSatisfactionModalProps {
  visible: boolean;
  customerName: string;
  response: SatisfactionAnalysisResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onReanalyze: () => void;
}

function dateLabel(value: string | null): string {
  if (!value) return "لا توجد رسالة";
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function riskLabel(risk: "low" | "medium" | "high") {
  if (risk === "high") return "مخاطر مرتفعة";
  if (risk === "medium") return "يحتاج متابعة";
  return "مستقر";
}

function sentimentLabel(sentiment: string) {
  const labels: Record<string, string> = {
    positive: "إيجابي",
    neutral: "محايد",
    negative: "سلبي",
    mixed: "مختلط",
  };
  return labels[sentiment] ?? sentiment;
}

export function CustomerSatisfactionModal({
  visible,
  customerName,
  response,
  loading,
  error,
  onClose,
  onRetry,
  onReanalyze,
}: CustomerSatisfactionModalProps) {
  const analysis = response?.analysis ?? null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
          >
            <Ionicons name="close" size={21} color={managerColors.ink} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle} numberOfLines={1} selectable>
              تحليل رضا {customerName}
            </Text>
            <Text style={styles.headerSubtitle} selectable>
              نتيجة محفوظة ومدعومة ببيانات المحادثة
            </Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles" size={20} color={managerColors.brand} />
          </View>
        </View>

        {loading && !analysis ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={managerColors.brand} size="large" />
            <Text style={styles.stateTitle} selectable>
              جارٍ تحليل المحادثة…
            </Text>
            <Text style={styles.stateBody} selectable>
              نراجع الرسائل والطلبات وبيانات الحجوزات المتاحة.
            </Text>
          </View>
        ) : error && !analysis ? (
          <View style={styles.centerState}>
            <Ionicons
              name="alert-circle-outline"
              size={38}
              color={managerColors.danger}
            />
            <Text style={styles.stateTitle} selectable>
              لم يكتمل التحليل
            </Text>
            <Text style={styles.stateBody} selectable>
              {error}
            </Text>
            <Pressable onPress={onRetry} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>المحاولة مرة أخرى</Text>
            </Pressable>
          </View>
        ) : analysis ? (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.content}
          >
            {error ? (
              <View style={styles.inlineError}>
                <Text style={styles.inlineErrorText} selectable>
                  تعذّرت إعادة التحليل، وما زالت النتيجة المحفوظة معروضة: {error}
                </Text>
              </View>
            ) : null}
            <View style={styles.scoreCard}>
              <View style={styles.scoreRow}>
                <Text style={styles.score} selectable>
                  {analysis.score}
                </Text>
                <Text style={styles.scoreOutOf} selectable>
                  /100
                </Text>
              </View>
              <View style={styles.badges}>
                <View
                  style={[
                    styles.badge,
                    analysis.risk_level === "high"
                      ? styles.badgeDanger
                      : analysis.risk_level === "medium"
                        ? styles.badgeWarning
                        : styles.badgeSuccess,
                  ]}
                >
                  <Text style={styles.badgeText} selectable>
                    {riskLabel(analysis.risk_level)}
                  </Text>
                </View>
                <View style={[styles.badge, styles.badgeNeutral]}>
                  <Text style={styles.badgeText} selectable>
                    الانطباع: {sentimentLabel(analysis.sentiment)}
                  </Text>
                </View>
              </View>
              <Text style={styles.summary} selectable>
                {analysis.summary}
              </Text>
              <Text style={styles.confidence} selectable>
                درجة الثقة في الأدلة: {analysis.confidence}%
              </Text>
            </View>

            <View
              style={[
                styles.freshnessCard,
                response?.cached
                  ? styles.freshnessCached
                  : analysis.analysis_mode === "reanalysis"
                    ? styles.freshnessWarning
                    : styles.freshnessFresh,
              ]}
            >
              <Text style={styles.freshnessTitle} selectable>
                {response?.cached
                  ? "نتيجة محفوظة — لا توجد بيانات جديدة"
                  : analysis.analysis_mode === "reanalysis"
                    ? "إعادة تحليل — لا توجد رسائل واتساب جديدة"
                    : `تحليل جديد شمل ${analysis.new_message_count} رسالة جديدة`}
              </Text>
              <Text style={styles.freshnessText} selectable>
                تم التحليل: {dateLabel(analysis.created_at)}
              </Text>
              <Text style={styles.freshnessText} selectable>
                آخر رسالة واتساب: {dateLabel(analysis.latest_message_at)}
              </Text>
            </View>

            <AnalysisSection
              title="نقاط إيجابية"
              icon="checkmark-circle-outline"
              items={analysis.strengths}
              empty="لم تظهر إشارات إيجابية صريحة."
            />
            <AnalysisSection
              title="مخاوف وملاحظات"
              icon="warning-outline"
              items={analysis.concerns}
              empty="لا توجد مخاوف واضحة في البيانات الحالية."
            />
            <AnalysisSection
              title="أسئلة دون إجابة"
              icon="chatbubble-ellipses-outline"
              items={analysis.unanswered_questions}
              empty="لم يكتشف التحليل أسئلة معلقة."
            />
            <AnalysisSection
              title="الإجراء المقترح"
              icon="sparkles-outline"
              items={analysis.recommended_actions}
              empty="لا يوجد إجراء عاجل مقترح."
            />

            <View style={styles.metricGrid}>
              <Metric
                label="رسائل العميل"
                value={analysis.metrics.customer_messages}
              />
              <Metric
                label="رسائل النشاط"
                value={analysis.metrics.business_messages}
              />
              <Metric
                label="متوسط الاستجابة"
                value={
                  analysis.metrics.median_response_minutes == null
                    ? "—"
                    : `${analysis.metrics.median_response_minutes} د`
                }
              />
              <Metric label="مخالفات SLA" value={analysis.metrics.sla_breaches} />
            </View>

            <Text style={styles.sourceStatus} selectable>
              واتساب: {analysis.whatsapp_status} · نحجز: {analysis.nehgz_status}
            </Text>

            <Pressable
              onPress={onReanalyze}
              disabled={loading}
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name="refresh" size={18} color="#FFFFFF" />
              )}
              <Text style={styles.primaryButtonText}>إعادة التحليل</Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function AnalysisSection({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: string[];
  empty: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name={icon} size={18} color={managerColors.brand} />
        <Text style={styles.sectionTitle} selectable>
          {title}
        </Text>
      </View>
      {items.length > 0 ? (
        <View style={styles.list}>
          {items.map((item, index) => (
            <View key={`${title}-${index}`} style={styles.listRow}>
              <View style={styles.bullet} />
              <Text style={styles.listText} selectable>
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText} selectable>
          {empty}
        </Text>
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue} selectable>
        {value}
      </Text>
      <Text style={styles.metricLabel} selectable numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: managerColors.bg },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: managerColors.border,
    backgroundColor: managerColors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: managerColors.surfaceTint,
  },
  headerContent: { flex: 1 },
  headerTitle: {
    textAlign: "right",
    fontSize: 17,
    fontWeight: "700",
    color: managerColors.ink,
  },
  headerSubtitle: {
    paddingTop: 2,
    textAlign: "right",
    fontSize: 11,
    color: managerColors.muted,
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: managerColors.brandSoft,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  stateTitle: {
    paddingTop: 16,
    fontSize: 17,
    fontWeight: "700",
    color: managerColors.ink,
  },
  stateBody: {
    maxWidth: 320,
    paddingTop: 8,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 22,
    color: managerColors.muted,
  },
  content: { gap: 14, padding: 16, paddingBottom: 36 },
  scoreCard: {
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 20,
    borderCurve: "continuous",
    backgroundColor: managerColors.surface,
    padding: 18,
    boxShadow: "0 10px 24px rgba(39, 59, 154, 0.08)",
  },
  scoreRow: { flexDirection: "row-reverse", alignItems: "flex-end" },
  score: {
    fontSize: 48,
    lineHeight: 52,
    fontWeight: "900",
    color: managerColors.ink,
    fontVariant: ["tabular-nums"],
  },
  scoreOutOf: { paddingBottom: 5, color: managerColors.muted, fontWeight: "700" },
  badges: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, paddingTop: 10 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  badgeDanger: { backgroundColor: "#FFE4E6" },
  badgeWarning: { backgroundColor: "#FEF3C7" },
  badgeSuccess: { backgroundColor: "#D1FAE5" },
  badgeNeutral: { backgroundColor: managerColors.brandSoft },
  badgeText: { fontSize: 12, fontWeight: "700", color: managerColors.ink },
  summary: {
    paddingTop: 14,
    textAlign: "right",
    fontSize: 15,
    lineHeight: 25,
    color: managerColors.ink,
  },
  confidence: { paddingTop: 8, textAlign: "right", fontSize: 11, color: managerColors.muted },
  freshnessCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  freshnessCached: { borderColor: "#BFDBFE", backgroundColor: "#EFF6FF" },
  freshnessWarning: { borderColor: "#FDE68A", backgroundColor: "#FFFBEB" },
  freshnessFresh: { borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" },
  freshnessTitle: { textAlign: "right", fontSize: 13, fontWeight: "700", color: managerColors.ink },
  freshnessText: { paddingTop: 4, textAlign: "right", fontSize: 11, color: managerColors.muted },
  inlineError: {
    borderWidth: 1,
    borderColor: "#FECDD3",
    borderRadius: 14,
    backgroundColor: "#FFF1F2",
    padding: 12,
  },
  inlineErrorText: {
    textAlign: "right",
    fontSize: 12,
    lineHeight: 20,
    color: "#881337",
  },
  section: {
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: managerColors.surface,
    padding: 15,
  },
  sectionTitleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: managerColors.ink },
  list: { gap: 9, paddingTop: 12 },
  listRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 9 },
  bullet: { width: 6, height: 6, marginTop: 8, borderRadius: 999, backgroundColor: managerColors.brand },
  listText: { flex: 1, textAlign: "right", fontSize: 13, lineHeight: 21, color: managerColors.muted },
  emptyText: { paddingTop: 12, textAlign: "right", fontSize: 12, color: managerColors.muted },
  metricGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  metric: {
    width: "48%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: managerColors.border,
    borderRadius: 14,
    backgroundColor: managerColors.surface,
    padding: 12,
  },
  metricValue: { textAlign: "center", fontSize: 20, fontWeight: "800", color: managerColors.ink, fontVariant: ["tabular-nums"] },
  metricLabel: { paddingTop: 4, textAlign: "center", fontSize: 10, color: managerColors.muted },
  sourceStatus: { textAlign: "center", fontSize: 11, color: managerColors.muted },
  primaryButton: {
    minHeight: 48,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: managerColors.brand,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  buttonDisabled: { opacity: 0.65 },
});
