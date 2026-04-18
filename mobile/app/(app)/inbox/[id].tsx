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
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  asArray,
  claimConversation,
  getTeamRoster,
  reassignConversation,
  replyToConversation,
  uploadConversationMedia,
  type ReplyAttachment,
  type TeamMemberRosterRow,
} from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { useSessionStore } from "../../../lib/session-store";
import { isManager } from "../../../lib/roles";
import { qk } from "../../../lib/query-keys";
import {
  SkeletonBlock,
  managerColors,
  premiumShadow,
} from "../../../components/manager-ui";

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
  const [pendingFile, setPendingFile] = useState<
    | { uri: string; name: string; type: string; sizeBytes?: number }
    | null
  >(null);
  const [uploading, setUploading] = useState(false);

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
    if (!body && !pendingFile) return;
    setSending(true);
    try {
      let attachment: ReplyAttachment | undefined;
      if (pendingFile) {
        setUploading(true);
        attachment = await uploadConversationMedia(id, {
          uri: pendingFile.uri,
          name: pendingFile.name,
          type: pendingFile.type,
        });
        setUploading(false);
      }
      await replyToConversation(id, body, attachment);
      setText("");
      setPendingFile(null);
      qc.invalidateQueries({ queryKey });
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert("تعذّر الإرسال", err?.message ?? "حاولي مرة أخرى");
    } finally {
      setSending(false);
      setUploading(false);
    }
  }, [id, text, pendingFile, qc, queryKey]);

  const pickImage = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("إذن مطلوب", "يلزم السماح بالوصول إلى الصور لإرسالها.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const ext =
        a.fileName?.split(".").pop()?.toLowerCase() ||
        (a.mimeType?.split("/")[1] ?? "jpg");
      setPendingFile({
        uri: a.uri,
        name: a.fileName ?? `image-${Date.now()}.${ext}`,
        type: a.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`,
        sizeBytes: a.fileSize,
      });
    } catch (e: unknown) {
      Alert.alert(
        "تعذّر اختيار الصورة",
        e instanceof Error ? e.message : "حاولي مرة أخرى"
      );
    }
  }, []);

  const pickDocument = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setPendingFile({
        uri: a.uri,
        name: a.name,
        type: a.mimeType ?? "application/octet-stream",
        sizeBytes: a.size ?? undefined,
      });
    } catch (e: unknown) {
      Alert.alert(
        "تعذّر اختيار الملف",
        e instanceof Error ? e.message : "حاولي مرة أخرى"
      );
    }
  }, []);

  if (!id) return null;

  if (query.isLoading || !conv) {
    return <ChatSkeleton />;
  }

  const windowState = getWindowState(conv.last_inbound_at);
  const expired = windowState.expired;

  return (
    <SafeAreaView className="flex-1 bg-[#F4F3EF]" edges={["top", "bottom"]}>
      <View className="border-b border-stone-200 bg-[#FFFDF8] px-4 pb-3 pt-2">
        <View className="flex-row-reverse items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-lg bg-stone-100"
          >
            <Ionicons name="arrow-forward" size={20} color={managerColors.ink} />
          </Pressable>
          <View className="h-11 w-11 items-center justify-center rounded-lg bg-emerald-50">
            <Ionicons name="person" size={20} color={managerColors.brand} />
          </View>
          <View className="flex-1">
            <Text
              className="text-right text-base font-bold text-[#151515]"
              numberOfLines={1}
            >
              {conv.customer_name || conv.customer_phone}
            </Text>
            <Text className="mt-0.5 text-right text-xs text-stone-500" selectable>
              {conv.customer_phone}
            </Text>
          </View>
          {manager ? (
            <Pressable
              onPress={() => setReassignOpen(true)}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-lg bg-stone-100"
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={managerColors.muted} />
            </Pressable>
          ) : null}
        </View>
        <View
          className={`mt-3 rounded-lg border px-3 py-2 ${
            windowState.tone === "danger"
              ? "border-red-200 bg-red-50"
              : windowState.tone === "warning"
              ? "border-amber-200 bg-amber-50"
              : windowState.tone === "success"
              ? "border-emerald-200 bg-emerald-50"
              : "border-gray-200 bg-gray-50"
          }`}
        >
          <View className="flex-row-reverse items-start gap-2">
            <Ionicons
              name={
                windowState.tone === "success"
                  ? "checkmark-circle"
                  : windowState.tone === "neutral"
                  ? "information-circle"
                  : "time"
              }
              size={18}
              color={
                windowState.tone === "danger"
                  ? managerColors.danger
                  : windowState.tone === "warning"
                  ? managerColors.warning
                  : windowState.tone === "success"
                  ? managerColors.brand
                  : managerColors.muted
              }
            />
            <View className="flex-1">
              <View className="flex-row-reverse flex-wrap items-center gap-2">
                <Text
                  className={`text-right text-sm font-semibold ${
                    windowState.tone === "danger"
                      ? "text-red-800"
                      : windowState.tone === "warning"
                      ? "text-amber-800"
                      : windowState.tone === "success"
                      ? "text-emerald-900"
                      : "text-stone-700"
                  }`}
                >
                  {windowState.title}
                </Text>
                <Text
                  className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${
                    conv.handler_mode === "unassigned"
                      ? "bg-red-100 text-red-800"
                      : conv.handler_mode === "bot"
                      ? "bg-indigo-100 text-indigo-800"
                      : "bg-emerald-100 text-emerald-900"
                  }`}
                >
                  {getOwnerLabel(conv)}
                </Text>
              </View>
              <Text className="mt-1 text-right text-xs leading-5 text-stone-600">
                {windowState.description}
              </Text>
            </View>
          </View>
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
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
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
          uploading={uploading}
          text={text}
          setText={setText}
          onClaim={onClaim}
          onSend={onSend}
          expired={expired}
          pendingFile={pendingFile}
          onPickImage={pickImage}
          onPickDocument={pickDocument}
          onClearPendingFile={() => setPendingFile(null)}
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
            className="rounded-t-lg bg-[#FFFDF8] p-4 pb-8"
          >
            <Text className="text-right text-lg font-bold text-[#151515]">
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
                  {asArray<TeamMemberRosterRow>(rosterQuery.data)
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
                className="flex-row-reverse items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 p-3"
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
                className="flex-row-reverse items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3"
              >
                <Text className="text-right text-sm font-semibold text-gray-800">
                  إلغاء التعيين
                </Text>
                <Ionicons name="refresh" size={20} color="#374151" />
              </Pressable>
              <Pressable
                onPress={() => setReassignOpen(false)}
                className="mt-1 items-center rounded-lg border border-gray-200 py-3"
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

function ChatSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-[#F4F3EF]" edges={["top", "bottom"]}>
      <View className="border-b border-stone-200 bg-[#FFFDF8] px-4 pb-3 pt-2">
        <View className="flex-row-reverse items-center gap-3">
          <SkeletonBlock className="h-10 w-10 rounded-lg" />
          <SkeletonBlock className="h-11 w-11 rounded-lg" />
          <View className="flex-1 items-end gap-2">
            <SkeletonBlock className="h-4 w-32 rounded-lg" />
            <SkeletonBlock className="h-3 w-24 rounded-lg" />
          </View>
          <SkeletonBlock className="h-10 w-10 rounded-lg" />
        </View>
        <View className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
          <View className="flex-row-reverse items-start gap-2">
            <SkeletonBlock className="h-4 w-4 rounded-lg" />
            <View className="flex-1 items-end gap-2">
              <View className="flex-row-reverse gap-2">
                <SkeletonBlock className="h-4 w-36 rounded-lg" />
                <SkeletonBlock className="h-4 w-16 rounded-lg" />
              </View>
              <SkeletonBlock className="h-3 w-48 rounded-lg" />
            </View>
          </View>
        </View>
      </View>

      <View className="flex-1 px-4 py-4">
        <View className="mb-5 items-center">
          <SkeletonBlock className="h-6 w-28 rounded-lg bg-[#FFFDF8]" />
        </View>

        <View className="mb-4 items-start">
          <SkeletonBlock className="mb-1 h-3 w-12 rounded-lg" />
          <SkeletonBlock className="h-14 w-36 rounded-lg bg-[#FFFDF8]" />
        </View>

        <View className="mb-4 items-start">
          <SkeletonBlock className="mb-1 h-3 w-12 rounded-lg" />
          <SkeletonBlock className="h-12 w-56 rounded-lg bg-[#FFFDF8]" />
        </View>

        <View className="mb-4 items-end">
          <SkeletonBlock className="mb-1 h-3 w-12 rounded-lg" />
          <SkeletonBlock className="h-20 w-64 rounded-lg bg-emerald-200" />
        </View>

        <View className="items-end">
          <SkeletonBlock className="mb-1 h-3 w-12 rounded-lg" />
          <SkeletonBlock className="h-24 w-72 rounded-lg bg-emerald-200" />
        </View>
      </View>

      <View className="border-t border-stone-200 bg-[#FFFDF8] px-3 pb-4 pt-3">
        <View className="flex-row-reverse items-end gap-2">
          <SkeletonBlock className="h-11 w-11 rounded-lg" />
          <SkeletonBlock className="h-11 w-11 rounded-lg" />
          <SkeletonBlock className="h-11 flex-1 rounded-lg" />
          <SkeletonBlock className="h-11 w-16 rounded-lg bg-emerald-200" />
        </View>
      </View>
    </SafeAreaView>
  );
}

function DateSeparator({ date }: { date: string }) {
  return (
    <View className="my-3 items-center">
      <Text className="rounded-lg bg-[#FFFDF8] px-3 py-1 text-xs font-medium text-stone-500">
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
        <View className="max-w-[90%] flex-row-reverse items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <Ionicons name="alert-circle-outline" size={16} color={managerColors.warning} />
          <Text className="flex-1 text-center text-xs leading-5 text-amber-800" selectable>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className={`my-1.5 flex ${isCustomer ? "items-start" : "items-end"}`}>
      <Text
        className={`mb-1 text-[11px] font-semibold ${
          isCustomer ? "text-stone-500" : "text-[#128C5B]"
        }`}
      >
        {isCustomer ? "العميل" : "الفريق"}
      </Text>
      <View
        className={`max-w-[84%] rounded-lg border px-3 py-2 ${
          isCustomer
            ? "border-stone-200 bg-[#FFFDF8]"
            : "border-[#128C5B] bg-[#128C5B]"
        }`}
        style={!isCustomer ? premiumShadow : undefined}
      >
        <Text
          className={`text-right text-sm leading-5 ${
            isCustomer ? "text-[#151515]" : "text-white"
          }`}
          selectable
        >
          {message.content}
        </Text>
        <Text
          className={`mt-1 text-left text-[11px] ${
            isCustomer ? "text-stone-400" : "text-emerald-50"
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
  uploading,
  text,
  setText,
  onClaim,
  onSend,
  expired,
  pendingFile,
  onPickImage,
  onPickDocument,
  onClearPendingFile,
}: {
  mode: "unassigned" | "human" | "bot";
  isMine: boolean;
  claiming: "human" | "bot" | null;
  sending: boolean;
  uploading: boolean;
  text: string;
  setText: (v: string) => void;
  onClaim: (m: "human" | "bot") => void;
  onSend: () => void;
  expired: boolean;
  pendingFile: {
    uri: string;
    name: string;
    type: string;
    sizeBytes?: number;
  } | null;
  onPickImage: () => void;
  onPickDocument: () => void;
  onClearPendingFile: () => void;
}) {
  if (mode === "unassigned") {
    return (
      <View className="border-t border-gray-200 bg-white px-3 pb-4 pt-3">
        <View className="mb-3 flex-row-reverse items-center gap-2">
          <View className="h-9 w-9 items-center justify-center rounded-lg bg-red-50">
            <Ionicons name="hand-left-outline" size={18} color="#B91C1C" />
          </View>
          <View className="flex-1">
            <Text className="text-right text-sm font-bold text-gray-950">
              المحادثة غير مستلمة
            </Text>
            <Text className="mt-0.5 text-right text-xs text-gray-500">
              اختاري جهة الاستلام قبل الرد على العميل.
            </Text>
          </View>
        </View>
        <View className="flex-row-reverse gap-2">
          <Pressable
            onPress={() => onClaim("human")}
            disabled={claiming !== null}
            className="flex-1 items-center rounded-lg bg-emerald-600 py-3.5"
          >
            {claiming === "human" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-semibold text-white">استلام الآن</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => onClaim("bot")}
            disabled={claiming !== null}
            className="flex-1 items-center rounded-lg border border-indigo-200 bg-indigo-50 py-3.5"
          >
            {claiming === "bot" ? (
              <ActivityIndicator />
            ) : (
              <Text className="font-semibold text-indigo-800">توكيل للبوت</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  if (mode === "human" && isMine) {
    const canSend = !!pendingFile || text.trim().length > 0;
    const isImage = pendingFile?.type.startsWith("image/");
    return (
      <View className="border-t border-gray-200 bg-white px-3 pb-4 pt-3">
        {expired && (
          <View className="mb-2 flex-row-reverse items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <Ionicons name="warning-outline" size={17} color="#B45309" />
            <Text className="flex-1 text-right text-xs leading-5 text-amber-800">
              انتهت نافذة الرد المجاني. تأكدي من سياسة قوالب واتساب قبل الإرسال.
            </Text>
          </View>
        )}
        {pendingFile && (
          <View className="mb-2 flex-row-reverse items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <Ionicons
              name={isImage ? "image-outline" : "document-outline"}
              size={18}
              color="#374151"
            />
            <Text
              className="flex-1 text-right text-xs text-gray-700"
              numberOfLines={1}
            >
              {pendingFile.name}
            </Text>
            <Pressable
              onPress={onClearPendingFile}
              disabled={sending}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color="#6B7280" />
            </Pressable>
          </View>
        )}
        <View className="flex-row-reverse items-end gap-2">
          <Pressable
            onPress={onPickImage}
            disabled={sending || !!pendingFile}
            hitSlop={6}
            className="h-11 w-11 items-center justify-center rounded-lg bg-gray-100"
          >
            <Ionicons
              name="image-outline"
              size={20}
              color={sending || !!pendingFile ? "#9CA3AF" : "#374151"}
            />
          </Pressable>
          <Pressable
            onPress={onPickDocument}
            disabled={sending || !!pendingFile}
            hitSlop={6}
            className="h-11 w-11 items-center justify-center rounded-lg bg-gray-100"
          >
            <Ionicons
              name="attach-outline"
              size={20}
              color={sending || !!pendingFile ? "#9CA3AF" : "#374151"}
            />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={pendingFile ? "أضيفي تعليقًا (اختياري)..." : "اكتبي ردك..."}
            className="min-h-11 max-h-28 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-right text-gray-950"
            multiline
          />
          <Pressable
            onPress={onSend}
            disabled={sending || !canSend}
            className={`h-11 min-w-16 items-center justify-center rounded-lg px-4 ${
              sending || !canSend ? "bg-gray-300" : "bg-emerald-600"
            }`}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-semibold text-white">
                {uploading ? "رفع..." : "إرسال"}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  if (mode === "bot") {
    return (
      <View className="border-t border-gray-200 bg-white px-3 pb-4 pt-3">
        <View className="mb-3 flex-row-reverse items-center gap-2">
          <View className="h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
            <Ionicons name="hardware-chip-outline" size={18} color="#3730A3" />
          </View>
          <View className="flex-1">
            <Text className="text-right text-sm font-bold text-gray-950">
              البوت يدير المحادثة
            </Text>
            <Text className="mt-0.5 text-right text-xs text-gray-500">
              استلميها يدويًا إذا احتاج العميل متابعة بشرية.
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => onClaim("human")}
          disabled={claiming !== null}
          className="items-center rounded-lg bg-emerald-600 py-3.5"
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
    <View className="border-t border-gray-200 bg-white px-3 pb-4 pt-3">
      <View className="flex-row-reverse items-center gap-2 rounded-lg bg-gray-50 px-3 py-3">
        <Ionicons name="lock-closed-outline" size={18} color="#6B7280" />
        <Text className="flex-1 text-right text-xs leading-5 text-gray-500">
          هذه المحادثة مستلمة من موظف آخر. يمكنك المتابعة للقراءة فقط.
        </Text>
      </View>
    </View>
  );
}
