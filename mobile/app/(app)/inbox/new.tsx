import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  type MarketingTemplate,
  listMarketingTemplates,
  startConversationWithTemplate,
} from "../../../lib/api";
import { qk } from "../../../lib/query-keys";
import { useSessionStore } from "../../../lib/session-store";
import { isManager } from "../../../lib/roles";
import {
  ManagerCard,
  managerColors,
  softShadow,
} from "../../../components/manager-ui";

/**
 * Start a new WhatsApp conversation with any number by sending an approved
 * template. Outside the 24h window WhatsApp only accepts templates, so this is
 * the entry point for outreach to new numbers and re-engaging old customers.
 *
 * Optional params: `phone`, `name` (prefill from customer / expired chat).
 */

const E164 = /^\+[1-9]\d{1,14}$/;
const VAR_RE = /\{\{\s*(\d+)\s*\}\}/g;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  // Saudi local formats: 05XXXXXXXX / 5XXXXXXXX → +9665XXXXXXXX
  if (/^05\d{8}$/.test(digits)) return `+966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `+966${digits}`;
  return digits;
}

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

function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "خطأ غير معروف";
  return msg.replace(/^\[\d+\]\s*/, "");
}

export default function NewTemplateConversationScreen() {
  const params = useLocalSearchParams<{ phone?: string; name?: string }>();
  const member = useSessionStore((s) => s.activeMember);
  const restaurantId = member?.restaurant_id ?? "";
  const manager = isManager(member);
  const qc = useQueryClient();

  const [phone, setPhone] = useState(params.phone ?? "");
  const [name, setName] = useState(params.name ?? "");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const templatesQuery = useQuery({
    queryKey: qk.marketingTemplates(restaurantId),
    enabled: manager && !!restaurantId,
    queryFn: listMarketingTemplates,
  });
  const templates = useMemo(
    () =>
      (templatesQuery.data ?? []).filter(
        (t: MarketingTemplate) => t.approval_status === "approved"
      ),
    [templatesQuery.data]
  );
  const template = templates.find((t) => t.id === templateId) ?? null;
  const indexes = placeholderIndexes(template?.body_template);

  const normalizedPhone = normalizePhone(phone.trim());
  const phoneValid = E164.test(normalizedPhone);
  const nameFallback =
    name.trim() ||
    (template?.language === "en" ? "Dear customer" : "عميلنا العزيز");
  const missingVars = indexes.filter((i) => i !== 1 && !values[String(i)]?.trim());
  const canSend = phoneValid && !!template && missingVars.length === 0;

  const sendMutation = useMutation({
    mutationFn: () => {
      const vars: Record<string, string> = {};
      for (const i of indexes) {
        const v = values[String(i)]?.trim();
        if (v) vars[String(i)] = v;
      }
      return startConversationWithTemplate({
        phone_number: normalizedPhone,
        template_id: template!.id,
        variables: vars,
        customer_name: name.trim() || null,
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      router.replace({
        pathname: "/inbox/[id]",
        params: { id: res.conversation_id },
      });
    },
    onError: (e: unknown) => Alert.alert("تعذّر الإرسال", cleanError(e)),
  });

  if (!manager) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#EFF3FF] p-6">
        <Ionicons name="lock-closed-outline" size={28} color={managerColors.muted} />
        <Text className="mt-3 text-center text-sm text-[#5E6A99]">
          بدء محادثة جديدة بقالب متاح للمدير فقط.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#EFF3FF]" edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-3 flex-row-reverse items-start gap-2 rounded-xl border border-[#D6DDF8] bg-[#E8EEFF] px-3 py-3">
            <Ionicons name="information-circle" size={18} color={managerColors.brand} />
            <Text className="flex-1 text-right text-xs leading-5 text-[#16245C]">
              يسمح واتساب ببدء المحادثة مع رقم جديد أو بعد انتهاء نافذة ٢٤ ساعة
              فقط عبر قالب معتمد. عند رد العميل يمكنك متابعة المحادثة بشكل طبيعي.
            </Text>
          </View>

          <ManagerCard className="mb-3">
            <Text className="text-right text-xs font-bold text-[#5E6A99]">
              رقم الواتساب
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+9665XXXXXXXX"
              placeholderTextColor="#98A2B3"
              autoCapitalize="none"
              keyboardType="phone-pad"
              className="mt-2 rounded-lg border border-[#D6DDF8] bg-white px-3 py-2.5 text-sm text-[#16245C]"
              style={{ textAlign: "left" }}
            />
            {phone.trim().length > 0 && !phoneValid ? (
              <Text className="mt-1 text-right text-xs text-[#E11D48]">
                أدخل الرقم بالصيغة الدولية مثل ‎+9665XXXXXXXX
              </Text>
            ) : phoneValid && normalizedPhone !== phone.trim() ? (
              <Text className="mt-1 text-right text-xs text-[#5E6A99]">
                سيتم الإرسال إلى ‎{normalizedPhone}
              </Text>
            ) : null}

            <Text className="mt-3 text-right text-xs font-bold text-[#5E6A99]">
              اسم العميل (اختياري)
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="يُستخدم في {{1}} إن وُجد"
              placeholderTextColor="#98A2B3"
              textAlign="right"
              className="mt-2 rounded-lg border border-[#D6DDF8] bg-white px-3 py-2.5 text-sm text-[#16245C]"
            />
          </ManagerCard>

          <ManagerCard className="mb-3">
            <View className="flex-row-reverse items-center justify-between">
              <Text className="text-right text-xs font-bold text-[#5E6A99]">
                اختر قالبًا معتمدًا
              </Text>
              <Pressable
                onPress={() => router.push("/campaigns/new")}
                hitSlop={8}
                className="flex-row-reverse items-center gap-1"
              >
                <Ionicons name="add" size={14} color={managerColors.brand} />
                <Text className="text-xs font-semibold text-[#011F91]">
                  قالب جديد
                </Text>
              </Pressable>
            </View>

            {templatesQuery.isLoading ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={managerColors.brand} />
            ) : templatesQuery.isError ? (
              <Pressable onPress={() => templatesQuery.refetch()} className="mt-3">
                <Text className="text-center text-xs text-[#E11D48]">
                  تعذّر تحميل القوالب — اضغط لإعادة المحاولة
                </Text>
              </Pressable>
            ) : templates.length === 0 ? (
              <Text className="mt-3 text-center text-xs leading-5 text-[#5E6A99]">
                لا توجد قوالب معتمدة بعد. أنشئ قالبًا وانتظر موافقة واتساب.
              </Text>
            ) : (
              <View className="mt-2 gap-2">
                {templates.map((t) => {
                  const active = t.id === templateId;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => {
                        setTemplateId(t.id);
                        setValues({});
                      }}
                      className={`rounded-lg border px-3 py-2.5 ${
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
                      <Text
                        className="mt-1 text-right text-xs leading-5 text-[#5E6A99]"
                        numberOfLines={active ? undefined : 2}
                      >
                        {t.body_template}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ManagerCard>

          {template && indexes.length > 0 ? (
            <ManagerCard className="mb-3">
              <Text className="text-right text-xs font-bold text-[#5E6A99]">
                قيم المتغيرات
              </Text>
              {indexes.map((i) => {
                const label = template.variables?.[i - 1];
                return (
                  <View key={i} className="mt-2">
                    <Text className="text-right text-xs text-[#5E6A99]">
                      {`{{${i}}}`}
                      {label ? ` · ${label}` : ""}
                      {i === 1 ? " (اختياري — يُستخدم اسم العميل)" : ""}
                    </Text>
                    <TextInput
                      value={values[String(i)] ?? ""}
                      onChangeText={(v) =>
                        setValues((prev) => ({ ...prev, [String(i)]: v }))
                      }
                      placeholder={i === 1 ? nameFallback : "أدخل القيمة"}
                      placeholderTextColor="#98A2B3"
                      textAlign="right"
                      className="mt-1 rounded-lg border border-[#D6DDF8] bg-white px-3 py-2 text-sm text-[#16245C]"
                    />
                  </View>
                );
              })}
            </ManagerCard>
          ) : null}

          {template ? (
            <ManagerCard className="mb-3">
              <Text className="text-right text-xs font-bold text-[#5E6A99]">
                معاينة الرسالة
              </Text>
              <View
                className="mt-2 self-end rounded-2xl rounded-tr-md bg-[#011F91] px-3 py-2.5"
                style={[softShadow, { maxWidth: "92%" }]}
              >
                {template.header_text ? (
                  <Text className="mb-1 text-right text-sm font-bold text-white">
                    {template.header_text}
                  </Text>
                ) : null}
                <Text className="text-right text-sm leading-6 text-white">
                  {renderPreview(template.body_template ?? "", values, nameFallback)}
                </Text>
                {template.footer_text ? (
                  <Text className="mt-1 text-right text-[11px] text-[#D6DDF8]">
                    {template.footer_text}
                  </Text>
                ) : null}
              </View>
            </ManagerCard>
          ) : null}
        </ScrollView>

        <View
          className="border-t border-[#D6DDF8] bg-[#FCFEFC] px-3 pb-4 pt-3"
        >
          <Pressable
            onPress={() => sendMutation.mutate()}
            disabled={!canSend || sendMutation.isPending}
            className="h-12 flex-row-reverse items-center justify-center gap-2 rounded-2xl"
            style={{
              backgroundColor:
                !canSend || sendMutation.isPending ? "#B8C2E8" : managerColors.brand,
            }}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={16} color="#FFFFFF" />
                <Text className="font-bold text-white">إرسال وبدء المحادثة</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
