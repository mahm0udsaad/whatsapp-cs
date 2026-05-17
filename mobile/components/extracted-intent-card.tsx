/**
 * Renders the AI-extracted intent blob from an approval/order in a
 * key-value + chip layout. Used by the Approvals list card AND the home
 * Overview widget so both surfaces stay consistent.
 *
 * Falls back to `null` when `intent` is null — the caller is expected to
 * show a plain message preview in that case (older rows + extraction
 * failures).
 */

import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ExtractedIntent } from "../lib/api";

const KIND_META: Record<
  ExtractedIntent["kind"],
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    backgroundColor: string;
    textColor: string;
  }
> = {
  booking: { label: "طلب حجز", icon: "calendar", backgroundColor: "#EEF2FF", textColor: "#312E81" },
  complaint: { label: "شكوى", icon: "warning", backgroundColor: "#FEF2F2", textColor: "#7F1D1D" },
  question: { label: "استفسار", icon: "help-circle", backgroundColor: "#F0F9FF", textColor: "#0C4A6E" },
  refund: { label: "طلب استرداد", icon: "cash", backgroundColor: "#FFFBEB", textColor: "#78350F" },
  other: { label: "طلب آخر", icon: "document-text", backgroundColor: "#F3F4F6", textColor: "#111827" },
};

const FIELD_LABELS: Record<string, string> = {
  customer_name: "الاسم",
  phone: "الهاتف",
  party_size: "عدد الأشخاص",
  date: "التاريخ",
  time: "الوقت",
  notes: "ملاحظات",
};

interface Props {
  intent: ExtractedIntent;
  /** "compact" — smaller version used inside the Overview widget. */
  variant?: "full" | "compact";
}

export function ExtractedIntentCard({ intent, variant = "full" }: Props) {
  const meta = KIND_META[intent.kind] ?? KIND_META.other;
  const providedEntries = Object.entries(intent.provided).filter(
    ([, v]) => v !== undefined && v !== null && String(v).trim().length > 0
  );

  const compact = variant === "compact";

  return (
    <View
      style={[styles.card, compact ? styles.cardCompact : styles.cardFull]}
    >
      <View style={styles.topRow}>
        <View
          style={[
            styles.kindPill,
            { backgroundColor: meta.backgroundColor },
          ]}
        >
          <Ionicons name={meta.icon} size={13} color={meta.textColor} />
          <Text style={[styles.kindText, { color: meta.textColor }]}>
            {meta.label}
          </Text>
        </View>
        {intent.ready_to_act ? (
          <View style={styles.readyPill}>
            <Ionicons name="checkmark-circle" size={12} color="#047857" />
            <Text style={styles.readyText}>
              جاهز للتنفيذ
            </Text>
          </View>
        ) : intent.missing.length > 0 ? (
          <View style={styles.missingPill}>
            <Ionicons name="alert-circle" size={12} color="#B45309" />
            <Text style={styles.missingText}>
              ناقص
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={[styles.summary, compact ? styles.summaryCompact : styles.summaryFull]}
        numberOfLines={compact ? 2 : 3}
      >
        {intent.summary}
      </Text>

      {providedEntries.length > 0 ? (
        <View style={styles.providedList}>
          {providedEntries.map(([key, value]) => (
            <View
              key={key}
              style={styles.providedRow}
            >
              <Text style={styles.providedLabel}>
                {FIELD_LABELS[key] ?? key}
              </Text>
              <Text
                style={styles.providedValue}
                numberOfLines={1}
                selectable
              >
                {String(value)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {intent.missing.length > 0 ? (
        <View style={styles.missingSection}>
          <Text style={styles.missingSectionTitle}>
            يحتاج منك
          </Text>
          <View style={styles.missingList}>
            {intent.missing.map((m) => (
              <View
                key={m}
                style={styles.missingChip}
              >
                <Text style={styles.missingChipText}>
                  {m}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {intent.suggested_action ? (
        <View style={styles.actionBox}>
          <Ionicons
            name="sparkles-outline"
            size={14}
            color="#475569"
            style={{ marginTop: 2 }}
          />
          <Text
            style={styles.actionText}
            numberOfLines={compact ? 2 : 3}
          >
            {intent.suggested_action}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
  },
  cardCompact: {
    padding: 12,
  },
  cardFull: {
    padding: 16,
  },
  topRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 8,
  },
  kindPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  kindText: {
    fontSize: 11,
    fontWeight: "700",
  },
  readyPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  readyText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#065F46",
  },
  missingPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  missingText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#92400E",
  },
  summary: {
    marginTop: 8,
    textAlign: "right",
    color: "#111827",
  },
  summaryCompact: {
    fontSize: 14,
    lineHeight: 20,
  },
  summaryFull: {
    fontSize: 14,
    lineHeight: 24,
  },
  providedList: {
    marginTop: 12,
    rowGap: 6,
  },
  providedRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  providedLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  providedValue: {
    maxWidth: "70%",
    textAlign: "right",
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  missingSection: {
    marginTop: 12,
  },
  missingSectionTitle: {
    marginBottom: 6,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  missingList: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    columnGap: 6,
    rowGap: 6,
  },
  missingChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  missingChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#78350F",
  },
  actionBox: {
    marginTop: 12,
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    columnGap: 6,
    borderRadius: 8,
    backgroundColor: "#F6F7F9",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionText: {
    flex: 1,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 20,
    color: "#374151",
  },
});
