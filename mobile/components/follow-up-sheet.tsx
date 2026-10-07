import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { Ionicons } from "@expo/vector-icons";
import { setConversationFollowUp } from "../lib/api";
import { managerColors } from "./manager-ui";

export type FollowUpState = {
  follow_up_at: string | null;
  follow_up_note: string | null;
  follow_up_by?: string | null;
  follow_up_by_name?: string | null;
};

const QUICK_NOTES = [
  "بانتظار رد العميل",
  "تأكيد الحجز",
  "إرسال عرض سعر",
  "التواصل لاحقاً",
];

type Patch = {
  follow_up_at: string | null;
  follow_up_note: string | null;
  follow_up_by: string | null;
  follow_up_by_name: string | null;
};

/**
 * Bottom sheet to flag / unflag a conversation for follow-up. Patches every
 * inbox page cache for this member plus the open chat's cache optimistically,
 * so the row moves into / out of the "للمتابعة" tab immediately; realtime
 * UPDATE on conversations reconciles the rest.
 */
export function FollowUpSheet({
  visible,
  onClose,
  conversationId,
  customerLabel,
  current,
  restaurantId,
  teamMemberId,
  teamMemberName,
}: {
  visible: boolean;
  onClose: () => void;
  conversationId: string | null;
  customerLabel?: string | null;
  current: FollowUpState | null;
  restaurantId: string;
  teamMemberId: string;
  teamMemberName?: string | null;
}) {
  const qc = useQueryClient();
  const isFlagged = !!current?.follow_up_at;
  const [note, setNote] = useState("");

  useEffect(() => {
    if (visible) setNote(current?.follow_up_note ?? "");
  }, [visible, current?.follow_up_note]);

  const mutation = useMutation({
    mutationFn: (input: { id: string; followUp: boolean; note: string | null }) =>
      setConversationFollowUp(input.id, input.followUp, input.note),
    onMutate: async (input) => {
      const patch: Patch = input.followUp
        ? {
            follow_up_at: current?.follow_up_at ?? new Date().toISOString(),
            follow_up_note: input.note,
            follow_up_by: teamMemberId || null,
            follow_up_by_name: teamMemberName ?? null,
          }
        : {
            follow_up_at: null,
            follow_up_note: null,
            follow_up_by: null,
            follow_up_by_name: null,
          };
      const inboxPrefix = ["inbox", restaurantId, teamMemberId];
      await qc.cancelQueries({ queryKey: inboxPrefix });
      const prevInbox = qc.getQueriesData<{ id: string }[]>({
        queryKey: inboxPrefix,
      });
      qc.setQueriesData<{ id: string }[]>({ queryKey: inboxPrefix }, (prev) =>
        prev?.map((c) => (c.id === input.id ? { ...c, ...patch } : c))
      );
      const convKey = ["conv", input.id];
      const prevConv = qc.getQueryData(convKey);
      qc.setQueryData<{ conversation: Record<string, unknown> } | undefined>(
        convKey,
        (prev) =>
          prev ? { ...prev, conversation: { ...prev.conversation, ...patch } } : prev
      );
      onClose();
      return { prevInbox, prevConv, convKey };
    },
    onError: (e: unknown, _input, ctx) => {
      ctx?.prevInbox.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx) qc.setQueryData(ctx.convKey, ctx.prevConv);
      Alert.alert(
        "خطأ",
        e instanceof Error ? e.message : "تعذّر تحديث المتابعة"
      );
    },
  });

  const save = (followUp: boolean) => {
    if (!conversationId || mutation.isPending) return;
    mutation.mutate({
      id: conversationId,
      followUp,
      note: followUp ? note.trim() || null : null,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View style={styles.titleIcon}>
              <Ionicons name="flag" size={18} color="#8A5A00" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {isFlagged ? "محادثة للمتابعة" : "إضافة للمتابعة"}
              </Text>
              {customerLabel ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {customerLabel}
                </Text>
              ) : null}
            </View>
          </View>

          {isFlagged && current?.follow_up_at ? (
            <Text style={styles.meta}>
              {current.follow_up_by_name
                ? `بواسطة ${current.follow_up_by_name} · `
                : ""}
              {formatDistanceToNow(new Date(current.follow_up_at), {
                addSuffix: true,
                locale: ar,
              })}
            </Text>
          ) : null}

          <Text style={styles.sectionTitle}>ماذا يجب متابعته؟</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="ملاحظة اختيارية للفريق..."
            placeholderTextColor="#98A2B3"
            style={styles.input}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <View style={styles.quickRow}>
            {QUICK_NOTES.map((q) => (
              <Pressable
                key={q}
                onPress={() => setNote(q)}
                style={[styles.quickChip, note === q && styles.quickChipActive]}
              >
                <Text
                  style={[
                    styles.quickChipText,
                    note === q && styles.quickChipTextActive,
                  ]}
                >
                  {q}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            disabled={mutation.isPending}
            onPress={() => save(true)}
            style={styles.primaryButton}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isFlagged ? "حفظ الملاحظة" : "إضافة للمتابعة"}
              </Text>
            )}
          </Pressable>
          {isFlagged ? (
            <Pressable
              disabled={mutation.isPending}
              onPress={() => save(false)}
              style={styles.doneButton}
            >
              <Ionicons name="checkmark-circle" size={18} color="#047857" />
              <Text style={styles.doneButtonText}>تمت المتابعة — إزالة العلامة</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>إغلاق</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(8, 16, 57, 0.42)",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: managerColors.surface,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 4,
    marginBottom: 18,
    backgroundColor: "#C7D0EA",
  },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    columnGap: 10,
    marginBottom: 6,
  },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF4CC",
  },
  title: {
    color: managerColors.ink,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "right",
  },
  subtitle: {
    marginTop: 2,
    color: managerColors.muted,
    fontSize: 12,
    textAlign: "right",
  },
  meta: {
    color: "#8A5A00",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
    marginBottom: 4,
  },
  sectionTitle: {
    marginTop: 14,
    marginBottom: 8,
    color: managerColors.muted,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
  input: {
    minHeight: 84,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E7FA",
    backgroundColor: "#F8FAFF",
    padding: 12,
    fontSize: 14,
    color: managerColors.ink,
    textAlign: "right",
  },
  quickRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    marginBottom: 18,
  },
  quickChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D6DDF8",
    backgroundColor: "#F5F7FF",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickChipActive: {
    borderColor: managerColors.brand,
    backgroundColor: managerColors.brand,
  },
  quickChipText: {
    color: managerColors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  quickChipTextActive: {
    color: "#FFFFFF",
  },
  primaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: managerColors.brand,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  doneButton: {
    marginTop: 10,
    minHeight: 48,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
  },
  doneButtonText: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "800",
  },
  closeButton: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  closeButtonText: {
    color: managerColors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
});
