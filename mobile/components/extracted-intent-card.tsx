/**
 * Renders the AI-extracted intent blob from an approval/order in a
 * key-value + chip layout. Used by the Approvals list card AND the home
 * Overview widget so both surfaces stay consistent.
 *
 * Falls back to `null` when `intent` is null — the caller is expected to
 * show a plain message preview in that case (older rows + extraction
 * failures).
 */

import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ExtractedIntent } from "../lib/api";

const KIND_META: Record<
  ExtractedIntent["kind"],
  { label: string; icon: keyof typeof Ionicons.glyphMap; tone: string }
> = {
  booking: { label: "طلب حجز", icon: "calendar", tone: "bg-indigo-50 text-indigo-900" },
  complaint: { label: "شكوى", icon: "warning", tone: "bg-red-50 text-red-900" },
  question: { label: "استفسار", icon: "help-circle", tone: "bg-sky-50 text-sky-900" },
  refund: { label: "طلب استرداد", icon: "cash", tone: "bg-amber-50 text-amber-900" },
  other: { label: "طلب آخر", icon: "document-text", tone: "bg-gray-100 text-gray-900" },
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
      className={`rounded-lg border border-gray-100 bg-white ${
        compact ? "p-3" : "p-4"
      }`}
    >
      {/* Kind pill + ready badge */}
      <View className="flex-row-reverse items-center gap-2">
        <View
          className={`flex-row-reverse items-center gap-1.5 rounded-lg px-2.5 py-1 ${meta.tone}`}
        >
          <Ionicons name={meta.icon} size={13} />
          <Text className={`text-[11px] font-bold ${meta.tone.split(" ")[1]}`}>
            {meta.label}
          </Text>
        </View>
        {intent.ready_to_act ? (
          <View className="flex-row-reverse items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5">
            <Ionicons name="checkmark-circle" size={12} color="#047857" />
            <Text className="text-[11px] font-semibold text-emerald-800">
              جاهز للتنفيذ
            </Text>
          </View>
        ) : intent.missing.length > 0 ? (
          <View className="flex-row-reverse items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5">
            <Ionicons name="alert-circle" size={12} color="#B45309" />
            <Text className="text-[11px] font-semibold text-amber-800">
              ناقص
            </Text>
          </View>
        ) : null}
      </View>

      {/* Summary */}
      <Text
        className={`mt-2 text-right text-gray-950 ${
          compact ? "text-sm leading-5" : "text-sm leading-6"
        }`}
        numberOfLines={compact ? 2 : 3}
      >
        {intent.summary}
      </Text>

      {/* Provided fields */}
      {providedEntries.length > 0 ? (
        <View className="mt-3 gap-1.5">
          {providedEntries.map(([key, value]) => (
            <View
              key={key}
              className="flex-row-reverse items-center justify-between"
            >
              <Text className="text-[11px] font-semibold text-gray-500">
                {FIELD_LABELS[key] ?? key}
              </Text>
              <Text
                className="max-w-[70%] text-right text-[13px] font-semibold text-gray-950"
                numberOfLines={1}
                selectable
              >
                {String(value)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Missing fields as chips */}
      {intent.missing.length > 0 ? (
        <View className="mt-3">
          <Text className="mb-1.5 text-right text-[11px] font-semibold text-gray-500">
            يحتاج منك
          </Text>
          <View className="flex-row-reverse flex-wrap gap-1.5">
            {intent.missing.map((m) => (
              <View
                key={m}
                className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5"
              >
                <Text className="text-[11px] font-semibold text-amber-900">
                  {m}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Suggested action */}
      {intent.suggested_action ? (
        <View className="mt-3 flex-row-reverse items-start gap-1.5 rounded-lg bg-[#F6F7F9] px-3 py-2">
          <Ionicons
            name="sparkles-outline"
            size={14}
            color="#475569"
            style={{ marginTop: 2 }}
          />
          <Text
            className="flex-1 text-right text-xs leading-5 text-gray-700"
            numberOfLines={compact ? 2 : 3}
          >
            {intent.suggested_action}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
