import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { getAiSchedule, saveAiSchedule, type AiSchedule } from "../lib/api";
import { qk } from "../lib/query-keys";

// Convert "HH:MM" (or "HH:MM:SS") to a Date anchored to today so the native
// picker has something to render, and back to a zero-padded "HH:MM" string.
function timeToDate(value: string): Date {
  const [h, m] = value.split(":");
  const d = new Date();
  d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return d;
}
function dateToTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  // Android shows the picker as a one-shot dialog opened on tap; iOS renders an
  // inline native time pill ("compact") that opens the wheel popover itself.
  const [androidOpen, setAndroidOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setAndroidOpen(false);
    if (event.type === "set" && date) onChange(dateToTime(date));
  };

  return (
    <View style={styles.field}>
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {Platform.OS === "ios" ? (
          <DateTimePicker
            value={timeToDate(value)}
            mode="time"
            display="compact"
            minuteInterval={5}
            onChange={handleChange}
            themeVariant="light"
          />
        ) : (
          <Pressable onPress={() => setAndroidOpen(true)} style={styles.timePill}>
            <Text style={styles.timePillText}>{value}</Text>
          </Pressable>
        )}
      </View>
      {Platform.OS === "android" && androidOpen ? (
        <DateTimePicker
          value={timeToDate(value)}
          mode="time"
          display="default"
          minuteInterval={5}
          onChange={handleChange}
        />
      ) : null}
    </View>
  );
}

export function AiScheduleSheet({
  visible,
  onClose,
  restaurantId,
}: {
  visible: boolean;
  onClose: () => void;
  restaurantId: string;
}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.aiSchedule(restaurantId),
    enabled: visible && !!restaurantId,
    queryFn: getAiSchedule,
  });

  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("22:00");
  const [weekend24h, setWeekend24h] = useState(false);

  // Seed local form state whenever fresh server data arrives.
  useEffect(() => {
    if (query.data) {
      setEnabled(query.data.enabled);
      setStart(query.data.start);
      setEnd(query.data.end);
      setWeekend24h(query.data.weekend24h);
    }
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (): Promise<AiSchedule> =>
      saveAiSchedule({ enabled, start, end, weekend24h }),
    onSuccess: (data) => {
      qc.setQueryData(qk.aiSchedule(restaurantId), data);
      onClose();
    },
  });

  const summary = useMemo(() => {
    if (!enabled) return "المساعد يعمل طوال اليوم بدون قيود زمنية.";
    const wk = weekend24h ? " ويعمل طوال اليوم في عطلة نهاية الأسبوع (الجمعة والسبت)." : "";
    return `يرد المساعد تلقائياً من ${start} إلى ${end} يومياً.${wk}`;
  }, [enabled, start, end, weekend24h]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="إغلاق">
            <Ionicons name="close" size={26} color="#16245C" />
          </Pressable>
          <Text style={styles.headerTitle}>جدولة المساعد الذكي</Text>
          <View style={{ width: 26 }} />
        </View>

        {query.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#011F91" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>تفعيل الجدولة</Text>
                  <Text style={styles.cardHint}>
                    عند التفعيل، يرد المساعد فقط خلال الأوقات المحددة.
                  </Text>
                </View>
                <Switch value={enabled} onValueChange={setEnabled} />
              </View>
            </View>

            {enabled ? (
              <>
                <TimeField label="وقت البدء" value={start} onChange={setStart} />
                <TimeField label="وقت الانتهاء" value={end} onChange={setEnd} />

                <View style={styles.card}>
                  <View style={styles.cardRow}>
                    <View style={styles.cardContent}>
                      <Text style={styles.cardTitle}>
                        تشغيل طوال اليوم في عطلة نهاية الأسبوع
                      </Text>
                      <Text style={styles.cardHint}>
                        الجمعة والسبت: يعمل المساعد ٢٤ ساعة بغض النظر عن الأوقات.
                      </Text>
                    </View>
                    <Switch value={weekend24h} onValueChange={setWeekend24h} />
                  </View>
                </View>
              </>
            ) : null}

            <Text style={styles.summary}>{summary}</Text>

            {mutation.isError ? (
              <Text style={styles.error}>تعذر الحفظ. حاول مرة أخرى.</Text>
            ) : null}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <Pressable
            onPress={() => mutation.mutate()}
            disabled={mutation.isPending || query.isLoading}
            style={[styles.saveButton, mutation.isPending && styles.saveButtonDisabled]}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>حفظ</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F7F9" },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#16245C" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: 16, rowGap: 12 },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
    padding: 16,
  },
  cardRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 12,
  },
  cardContent: { flex: 1 },
  cardTitle: {
    textAlign: "right",
    fontSize: 16,
    fontWeight: "600",
    color: "#16245C",
  },
  cardHint: {
    marginTop: 4,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 20,
    color: "#7A88B8",
  },
  field: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 12,
  },
  fieldLabel: {
    textAlign: "right",
    fontSize: 16,
    fontWeight: "600",
    color: "#16245C",
  },
  timePill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EBFB",
    backgroundColor: "#F5F7FF",
  },
  timePillText: { fontSize: 17, fontWeight: "700", color: "#16245C" },
  summary: {
    textAlign: "right",
    fontSize: 13,
    lineHeight: 22,
    color: "#5E6A99",
    paddingHorizontal: 4,
  },
  error: { textAlign: "right", fontSize: 13, color: "#DC2626" },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E7EBFB",
    backgroundColor: "#FFFFFF",
  },
  saveButton: {
    alignItems: "center",
    borderRadius: 22,
    backgroundColor: "#011F91",
    paddingVertical: 16,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
