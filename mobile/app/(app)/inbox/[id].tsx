import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Ionicons } from "@expo/vector-icons";
import {
  claimConversation,
  getTeamRoster,
  reassignConversation,
  replyToConversation,
  type TeamMemberRosterRow,
} from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { useSessionStore } from "../../../lib/session-store";
import { isManager } from "../../../lib/roles";
import { qk } from "../../../lib/query-keys";

type Msg = {
  id: string;
  role: "customer" | "agent" | "system";
  content: string;
  message_type: string;
  created_at: string;
};

type ConvRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  last_inbound_at: string | null;
  handler_mode: "unassigned" | "human" | "bot";
  assigned_to: string | null;
};

type ConvPayload = {
  conversation: ConvRow & { assignee_name: string | null; is_mine: boolean };
  messages: Msg[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getWindowState(lastInboundAt: string | null) {
  if (!lastInboundAt) {
    return {
      expired: false,
      tone: "neutral" as const,
      title: "لا توجد رسالة واردة حديثة",
      description: "ستظهر نافذة الرد عند وصول رسالة من العميل.",
    };
  }

  const elapsed = Date.now() - new Date(lastInboundAt).getTime();
  const remaining = DAY_MS - elapsed;

  if (remaining <= 0) {
    return {
      expired: true,
      tone: "warning" as const,
      title: "انتهت نافذة الرد",
      description: "قد تحتاجين إلى استخدام قالب واتساب معتمد قبل إرسال رد جديد.",
    };
  }

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.max(1, Math.floor(remaining / (60 * 1000)));

  if (hours < 1) {
    return {
      expired: false,
      tone: "danger" as const,
      title: `تنتهي نافذة الرد خلال ${minutes} دقيقة`,
      description: "هذه المحادثة تحتاج متابعة سريعة.",
    };
  }

  if (hours <= 3) {
    return {
      expired: false,
      tone: "warning" as const,
      title: `متبقي ${hours} ساعات في نافذة الرد`,
      description: "الأفضل إنهاء الرد قبل انتهاء نافذة واتساب.",
    };
  }

  return {
    expired: false,
    tone: "success" as const,
    title: `داخل نافذة الرد - متبقي ${hours} ساعة`,
    description: "يمكنك الرد على العميل مباشرة.",
  };
}

function getOwnerLabel(conv: ConvPayload["conversation"]) {
  if (conv.handler_mode === "unassigned") return "غير مستلمة";
  if (conv.handler_mode === "bot") return "موكلة للبوت";
  if (conv.is_mine) return "معك الآن";
  return conv.assignee_name ? `مع ${conv.assignee_name}` : "مع موظف";
}

export default function ConversationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const member = useSessionStore((s) => s.activeMember);
  const teamMemberId = member?.id ?? "";
  const manager = isManager(member);
  const restaurantId = member?.restaurant_id ?? "";
  const listRef = useRef<FlatList<Msg>>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [claiming, setClaiming] = useState<"human" | "bot" | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);

  const rosterQuery = useQuery({
    queryKey: qk.teamRoster(restaurantId),
    enabled: manager && !!restaurantId && reassignOpen,
    queryFn: getTeamRoster,
  });

  const reassignMutation = useMutation({
    mutationFn: (input: {
      conversationId: string;
      assignToTeamMemberId?: string;
      forceBot?: boolean;
      unassign?: boolean;
    }) => reassignConversation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conv", id] });
      qc.invalidateQueries({ queryKey: ["inbox", restaurantId] });
      qc.invalidateQueries({ queryKey: qk.kpisToday(restaurantId) });
      setReassignOpen(false);
    },
    onError: (e: unknown) => {
      Alert.alert("خطأ", e instanceof Error ? e.message : "تعذّر التحويل");
    },
  });

  const queryKey = useMemo(() => ["conv", id], [id]);

  const query = useQuery({
    queryKey,
    enabled: !!id,
    queryFn: async (): Promise<ConvPayload> => {
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .select(
          "id, customer_name, customer_phone, last_inbound_at, handler_mode, assigned_to"
        )
        .eq("id", id!)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv) throw new Error("Conversation not found");

      const [msgsRes, assigneeRes] = await Promise.all([
        supabase
          .from("messages")
          .select("id, role, content, message_type, created_at")
          .eq("conversation_id", id!)
          .order("created_at", { ascending: true })
          .limit(200),
        conv.assigned_to
          ? supabase
              .from("team_members")
              .select("full_name")
              .eq("id", conv.assigned_to)
              .maybeSingle()
          : Promise.resolve({ data: null as { full_name: string | null } | null, error: null }),
      ]);
      if (msgsRes.error) throw msgsRes.error;

      return {
        conversation: {
          ...(conv as ConvRow),
          assignee_name: (assigneeRes.data?.full_name as string | null) ?? null,
          is_mine: conv.assigned_to === teamMemberId,
        },
        messages: (msgsRes.data ?? []) as Msg[],
      };
    },
  });

  const conv = query.data?.conversation;
  const messages = query.data?.messages ?? [];

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`conv-msgs:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc, queryKey]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages.length]);

  const onClaim = useCallback(
    async (mode: "human" | "bot") => {
      if (!id) return;
      setClaiming(mode);
      try {
        await claimConversation(id, mode);
        qc.invalidateQueries({ queryKey });
        if (member?.restaurant_id) {
          qc.invalidateQueries({ queryKey: ["inbox", member.restaurant_id] });
        }
      } catch (e: unknown) {
        const err = e as { message?: string };
        Alert.alert("تعذّر الاستلام", err?.message ?? "حاولي مرة أخرى");
      } finally {
        setClaiming(null);
      }
    },
    [id, qc, queryKey, member?.restaurant_id]
  );

  const onSend = useCallback(async () => {
    if (!id) return;
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await replyToConversation(id, body);
      setText("");
      qc.invalidateQueries({ queryKey });
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert("تعذّر الإرسال", err?.message ?? "حاولي مرة أخرى");
    } finally {
      setSending(false);
    }
  }, [id, text, qc, queryKey]);

  if (!id) return null;

  if (query.isLoading || !conv) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-gray-50"
        edges={["top", "bottom"]}
      >
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const windowState = getWindowState(conv.last_inbound_at);
  const expired = windowState.expired;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top", "bottom"]}>
      <View className="flex-row-reverse items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
        <Pressable onPress={() => router.back()}>
          <Text className="text-brand text-sm">رجوع</Text>
        </Pressable>
        <View className="flex-1 items-center px-3">
          <Text className="text-base font-bold text-gray-950" numberOfLines={1}>
            {conv.customer_name || conv.customer_phone}
          </Text>
          <Text className="mt-0.5 text-xs text-gray-500" selectable>
            {conv.customer_phone}
          </Text>
        </View>
        {manager ? (
          <Pressable onPress={() => setReassignOpen(true)} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#374151" />
          </Pressable>
        ) : (
          <View className="w-12" />
        )}
      </View>

      <View className="border-b border-gray-100 bg-white px-4 py-3">
        <View className="flex-row-reverse flex-wrap items-center gap-2">
          <Text
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              conv.handler_mode === "unassigned"
                ? "bg-red-50 text-red-800"
                : conv.handler_mode === "bot"
                ? "bg-indigo-50 text-indigo-800"
                : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {getOwnerLabel(conv)}
          </Text>
          {conv.assignee_name && conv.handler_mode !== "human" && (
            <Text className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
              عبر {conv.assignee_name}
            </Text>
          )}
        </View>
        <View
          className={`mt-3 rounded-xl border px-3 py-2 ${
            windowState.tone === "danger"
              ? "border-red-100 bg-red-50"
              : windowState.tone === "warning"
              ? "border-amber-100 bg-amber-50"
              : windowState.tone === "success"
              ? "border-emerald-100 bg-emerald-50"
              : "border-gray-100 bg-gray-50"
          }`}
        >
          <Text
            className={`text-right text-sm font-semibold ${
              windowState.tone === "danger"
                ? "text-red-800"
                : windowState.tone === "warning"
                ? "text-amber-800"
                : windowState.tone === "success"
                ? "text-emerald-800"
                : "text-gray-700"
            }`}
          >
            {windowState.title}
          </Text>
          <Text className="mt-1 text-right text-xs leading-5 text-gray-600">
            {windowState.description}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item, index }) => {
            const prev = messages[index - 1];
            const showDate =
              !prev ||
              new Date(prev.created_at).toDateString() !==
                new Date(item.created_at).toDateString();
            return (
              <>
                {showDate && <DateSeparator date={item.created_at} />}
                <MessageBubble message={item} />
              </>
            );
          }}
          ListEmptyComponent={
            <View className="items-center px-8 py-20">
              <Text className="text-center text-base font-semibold text-gray-700">
                لا توجد رسائل بعد
              </Text>
              <Text className="mt-2 text-center text-sm text-gray-500">
                عند وصول أول رسالة من العميل ستظهر هنا.
              </Text>
            </View>
          }
        />

        <Footer
          mode={conv.handler_mode}
          isMine={conv.is_mine}
          claiming={claiming}
          sending={sending}
          text={text}
          setText={setText}
          onClaim={onClaim}
          onSend={onSend}
          expired={expired}
        />
      </KeyboardAvoidingView>

      {/* Manager reassign sheet */}
      <Modal
        visible={reassignOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReassignOpen(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setReassignOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-t-3xl bg-white p-4 pb-8"
          >
            <Text className="text-right text-lg font-bold text-gray-950">
              إدارة المحادثة
            </Text>
            <View className="mt-4">
              <Text className="mb-2 text-right text-xs font-semibold text-gray-600">
                نقل إلى موظف
              </Text>
              {rosterQuery.isLoading ? (
                <ActivityIndicator />
              ) : (
                <ScrollView style={{ maxHeight: 220 }}>
                  {(rosterQuery.data ?? [])
                    .filter((m) => m.is_active)
                    .map((m: TeamMemberRosterRow) => (
                      <Pressable
                        key={m.id}
                        disabled={reassignMutation.isPending}
                        onPress={() =>
                          id &&
                          reassignMutation.mutate({
                            conversationId: id as string,
                            assignToTeamMemberId: m.id,
                          })
                        }
                        className="flex-row-reverse items-center justify-between border-b border-gray-100 py-3"
                      >
                        <View className="flex-row-reverse items-center gap-2">
                          <View
                            className={`h-2 w-2 rounded-full ${
                              m.is_available && m.on_shift_now
                                ? "bg-emerald-500"
                                : m.is_available
                                ? "bg-emerald-300"
                                : "bg-gray-300"
                            }`}
                          />
                          <Text className="text-right text-sm font-semibold text-gray-950">
                            {m.full_name ?? "—"}
                          </Text>
                        </View>
                        <Text className="text-xs text-gray-500">
                          {m.role === "admin" ? "مدير" : "موظف"}
                        </Text>
                      </Pressable>
                    ))}
                </ScrollView>
              )}
            </View>

            <View className="mt-4 gap-2">
              <Pressable
                disabled={reassignMutation.isPending}
                onPress={() =>
                  id &&
                  reassignMutation.mutate({
                    conversationId: id as string,
                    forceBot: true,
                  })
                }
                className="flex-row-reverse items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 p-3"
              >
                <Text className="text-right text-sm font-semibold text-indigo-900">
                  إرجاع للبوت
                </Text>
                <Ionicons
                  name="hardware-chip-outline"
                  size={20}
                  color="#3730A3"
                />
              </Pressable>
              <Pressable
                disabled={reassignMutation.isPending}
                onPress={() =>
                  id &&
                  reassignMutation.mutate({
                    conversationId: id as string,
                    unassign: true,
                  })
                }
                className="flex-row-reverse items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3"
              >
                <Text className="text-right text-sm font-semibold text-gray-800">
                  إلغاء التعيين
                </Text>
                <Ionicons name="refresh" size={20} color="#374151" />
              </Pressable>
              <Pressable
                onPress={() => setReassignOpen(false)}
                className="mt-1 items-center rounded-xl border border-gray-200 py-3"
              >
                <Text className="text-sm text-gray-700">إغلاق</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function DateSeparator({ date }: { date: string }) {
  return (
    <View className="my-3 items-center">
      <Text className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
        {format(new Date(date), "EEEE d MMMM", { locale: ar })}
      </Text>
    </View>
  );
}

function MessageBubble({ message }: { message: Msg }) {
  const isCustomer = message.role === "customer";
  const isSystem = message.role === "system";
  if (isSystem) {
    return (
      <View className="my-2 items-center">
        <Text className="max-w-[86%] rounded-xl bg-amber-50 px-3 py-2 text-center text-xs leading-5 text-amber-800">
          {message.content}
        </Text>
      </View>
    );
  }

  return (
    <View className={`my-1 flex ${isCustomer ? "items-start" : "items-end"}`}>
      <View
        className={`max-w-[82%] rounded-2xl px-3 py-2 ${
          isCustomer
            ? "bg-white border border-gray-100"
            : "bg-emerald-600"
        }`}
      >
        <Text
          className={`text-right text-sm leading-5 ${
            isCustomer ? "text-gray-950" : "text-white"
          }`}
        >
          {message.content}
        </Text>
        <Text
          className={`mt-1 text-left text-[11px] ${
            isCustomer ? "text-gray-400" : "text-emerald-50"
          }`}
        >
          {format(new Date(message.created_at), "HH:mm")}
        </Text>
      </View>
    </View>
  );
}

function Footer({
  mode,
  isMine,
  claiming,
  sending,
  text,
  setText,
  onClaim,
  onSend,
  expired,
}: {
  mode: "unassigned" | "human" | "bot";
  isMine: boolean;
  claiming: "human" | "bot" | null;
  sending: boolean;
  text: string;
  setText: (v: string) => void;
  onClaim: (m: "human" | "bot") => void;
  onSend: () => void;
  expired: boolean;
}) {
  if (mode === "unassigned") {
    return (
      <View className="border-t border-gray-100 bg-white p-3">
        <Text className="mb-3 text-center text-xs leading-5 text-gray-500">
          اختاري من سيتولى المحادثة قبل الرد على العميل.
        </Text>
        <Pressable
          onPress={() => onClaim("human")}
          disabled={claiming !== null}
          className="mb-2 items-center rounded-xl bg-emerald-600 py-3.5"
        >
          {claiming === "human" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-semibold text-white">استلام المحادثة</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => onClaim("bot")}
          disabled={claiming !== null}
          className="items-center rounded-xl border border-indigo-100 bg-indigo-50 py-3"
        >
          {claiming === "bot" ? (
            <ActivityIndicator />
          ) : (
            <Text className="font-semibold text-indigo-800">توكيل للبوت</Text>
          )}
        </Pressable>
      </View>
    );
  }

  if (mode === "human" && isMine) {
    return (
      <View className="border-t border-gray-100 bg-white p-3">
        {expired && (
          <Text className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs leading-5 text-amber-800">
            انتهت نافذة الرد المجاني. تأكدي من سياسة قوالب واتساب قبل الإرسال.
          </Text>
        )}
        <View className="flex-row-reverse items-center gap-2">
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="اكتبي ردك..."
            className="max-h-28 flex-1 rounded-xl bg-gray-100 px-3 py-2 text-right text-gray-950"
            multiline
          />
          <Pressable
            onPress={onSend}
            disabled={sending || !text.trim()}
            className={`rounded-xl px-4 py-3 ${
              sending || !text.trim() ? "bg-gray-300" : "bg-emerald-600"
            }`}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-semibold text-white">إرسال</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  if (mode === "bot") {
    return (
      <View className="border-t border-gray-100 bg-white p-3">
        <Text className="mb-3 text-center text-xs leading-5 text-gray-500">
          البوت يدير هذه المحادثة الآن. يمكنك استلامها يدويًا عند الحاجة.
        </Text>
        <Pressable
          onPress={() => onClaim("human")}
          disabled={claiming !== null}
          className="items-center rounded-xl bg-emerald-600 py-3.5"
        >
          {claiming === "human" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-semibold text-white">استلام يدوي</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View className="border-t border-gray-100 bg-white p-3">
      <Text className="text-center text-xs leading-5 text-gray-500">
        هذه المحادثة مستلمة من موظف آخر. يمكنك المتابعة للقراءة فقط.
      </Text>
    </View>
  );
}
