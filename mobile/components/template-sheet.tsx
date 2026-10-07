import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
} from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  type ChatTemplate,
  getApiErrorMessage,
  listChatTemplates,
  sendConversationTemplate,
} from "../lib/api";
import { qk } from "../lib/query-keys";
import { managerColors, softShadow } from "./manager-ui";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "./tw";

/**
 * Bottom sheet for sending an approved WhatsApp template on a conversation.
 * Templates are the only thing WhatsApp accepts for a new number or after the
 * 24h window closes. Pick → fill variables → preview → send.
 *
 * {{1}} is the customer name by convention (falls back server-side), so its
 * input is optional; every other variable is required.
 */

const VAR_RE = /\{\{\s*(\d+)\s*\}\}/g;

function placeholderIndexes(body: string | null | undefined): number[] {
  if (!body) return [];
  const set = new Set<number>();
  for (const m of body.matchAll(VAR_RE)) set.add(Number(m[1]));
  return Array.from(set).sort((a, b) => a - b);
}

function renderPreview(
  body: string,
  values: Record<string, string>,
  nameFallback: string
): string {
  return body.replace(VAR_RE, (match, g1: string) => {
    const v = values[g1]?.trim();
    if (v) return v;
    if (g1 === "1") return nameFallback;
    return match;
  });
}

export function TemplateSheet({
  visible,
  onClose,
  conversationId,
  restaurantId,
  customerName,
  onSent,
}: {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  restaurantId: string;
  customerName: string | null;
  onSent: (result: { claimed: boolean }) => void;
}) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!visible) {
      setTemplateId(null);
      setValues({});
    }
  }, [visible]);

  const templatesQuery = useQuery({
    queryKey: qk.chatTemplates(restaurantId),
    enabled: visible && !!restaurantId,
    queryFn: () => listChatTemplates(restaurantId),
  });
  const templates = useMemo(
    () => (Array.isArray(templatesQuery.data) ? templatesQuery.data : []),
    [templatesQuery.data]
  );
  const template: ChatTemplate | null =
    templates.find((t) => t.id === templateId) ?? null;
  const indexes = placeholderIndexes(template?.body_template);
  const nameFallback =
    customerName?.trim() ||
    (template?.language === "en" ? "Dear customer" : "عميلنا العزيز");
  const missing = indexes.filter((i) => i !== 1 && !values[String(i)]?.trim());
  const canSend = !!template && missing.length === 0;

  const sendMutation = useMutation({
    mutationFn: () => {
      const vars: Record<string, string> = {};
      for (const i of indexes) {
        const v = values[String(i)]?.trim();
        if (v) vars[String(i)] = v;
      }
      return sendConversationTemplate(conversationId, {
        template_id: template!.id,
        variables: vars,
      });
    },
    onSuccess: (res) => onSent({ claimed: !!res?.claimed }),
    onError: (e: unknown) =>
      Alert.alert("تعذّر إرسال القالب", getApiErrorMessage(e)),
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
            <View style={styles.grabber} />
            <View className="flex-row-reverse items-center justify-between">
              <Text className="text-right text-lg font-bold text-[#16245C]">
                إرسال قالب واتساب
              </Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color={managerColors.muted} />
              </Pressable>
            </View>
            <Text className="mt-1 text-right text-xs leading-5 text-[#5E6A99]">
              لبدء محادثة جديدة أو بعد انتهاء نافذة ٢٤ ساعة يجب استخدام قالب
              معتمد.
            </Text>

            <ScrollView
              style={{ marginTop: 12 }}
              contentContainerStyle={{ paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
            >
              {templatesQuery.isLoading ? (
                <ActivityIndicator
                  style={{ marginVertical: 24 }}
                  color={managerColors.brand}
                />
              ) : templatesQuery.isError ? (
                <Pressable
                  onPress={() => templatesQuery.refetch()}
                  className="items-center py-6"
                >
                  <Text className="text-center text-xs text-[#E11D48]">
                    تعذّر تحميل القوالب — اضغط لإعادة المحاولة
                  </Text>
                </Pressable>
              ) : templates.length === 0 ? (
                <View className="items-center py-6">
                  <Ionicons
                    name="document-text-outline"
                    size={26}
                    color={managerColors.muted}
                  />
                  <Text className="mt-2 text-center text-xs leading-5 text-[#5E6A99]">
                    لا توجد قوالب معتمدة بعد. اطلب من المدير إنشاء قالب من
                    قسم الحملات.
                  </Text>
                </View>
              ) : (
                <View className="gap-2">
                  {templates.map((t) => {
                    const active = t.id === templateId;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => {
                          setTemplateId(active ? null : t.id);
                          setValues({});
                        }}
                        className={`rounded-xl border px-3 py-2.5 ${
                          active
                            ? "border-[#011F91] bg-[#E2E8FF]"
                            : "border-[#D6DDF8] bg-white"
                        }`}
                      >
                        <View className="flex-row-reverse items-center gap-2">
                          <Ionicons
                            name={active ? "radio-button-on" : "radio-button-off"}
                            size={16}
                            color={active ? managerColors.brand : managerColors.muted}
                          />
                          <Text
                            className="flex-1 text-right text-sm font-semibold text-[#16245C]"
                            numberOfLines={1}
                          >
                            {t.name}
                          </Text>
                          {t.category ? (
                            <Text className="text-[10px] font-bold text-[#5E6A99]">
                              {t.category === "UTILITY" ? "خدمي" : "تسويقي"}
                            </Text>
                          ) : null}
                        </View>
                        {!active ? (
                          <Text
                            className="mt-1 text-right text-xs leading-5 text-[#5E6A99]"
                            numberOfLines={2}
                          >
                            {t.body_template}
                          </Text>
                        ) : null}

                        {active && indexes.length > 0 ? (
                          <View className="mt-2">
                            {indexes.map((i) => {
                              const label = t.variables?.[i - 1];
                              return (
                                <View key={i} className="mt-1.5">
                                  <Text className="text-right text-xs text-[#5E6A99]">
                                    {`{{${i}}}`}
                                    {label ? ` · ${label}` : ""}
                                    {i === 1 ? " (اختياري — اسم العميل)" : ""}
                                  </Text>
                                  <TextInput
                                    value={values[String(i)] ?? ""}
                                    onChangeText={(v) =>
                                      setValues((prev) => ({
                                        ...prev,
                                        [String(i)]: v,
                                      }))
                                    }
                                    placeholder={i === 1 ? nameFallback : "أدخل القيمة"}
                                    placeholderTextColor="#98A2B3"
                                    textAlign="right"
                                    className="mt-1 rounded-lg border border-[#D6DDF8] bg-white px-3 py-2 text-sm text-[#16245C]"
                                  />
                                </View>
                              );
                            })}
                          </View>
                        ) : null}

                        {active ? (
                          <View
                            className="mt-3 self-end rounded-2xl rounded-tr-md bg-[#011F91] px-3 py-2.5"
                            style={[softShadow, { maxWidth: "92%" }]}
                          >
                            {t.header_text ? (
                              <Text className="mb-1 text-right text-sm font-bold text-white">
                                {t.header_text}
                              </Text>
                            ) : null}
                            <Text className="text-right text-sm leading-6 text-white">
                              {renderPreview(t.body_template ?? "", values, nameFallback)}
                            </Text>
                            {t.footer_text ? (
                              <Text className="mt-1 text-right text-[11px] text-[#D6DDF8]">
                                {t.footer_text}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <Pressable
              onPress={() => sendMutation.mutate()}
              disabled={!canSend || sendMutation.isPending}
              className="mt-2 h-12 flex-row-reverse items-center justify-center gap-2 rounded-2xl"
              style={{
                backgroundColor:
                  !canSend || sendMutation.isPending
                    ? "#B8C2E8"
                    : managerColors.brand,
              }}
            >
              {sendMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
                  <Text className="font-bold text-white">إرسال القالب</Text>
                </>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    maxHeight: "85%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D6DDF8",
    marginBottom: 10,
  },
});
