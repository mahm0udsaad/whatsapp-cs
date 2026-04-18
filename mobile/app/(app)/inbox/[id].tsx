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
import { format, formatDistanceToNow } from "date-fns";
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
import {
  escalationReasonLabel,
  escalationReasonTone,
} from "../../../lib/escalation-labels";

type TwilioStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | null;

type Msg = {
  id: string;
  role: "customer" | "agent" | "system";
  content: string;
  message_type: string;
  created_at: string;
  twilio_status: TwilioStatus;
};

type ConvRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  last_inbound_at: string | null;
  handler_mode: "unassigned" | "human" | "bot";
  assigned_to: string | null;
  unread_count: number;
};

type PendingEscalation = {
  id: string;
  created_at: string;
  reason_code: string | null;
  message: string | null;
};

type ConvPayload = {
  conversation: ConvRow & { assignee_name: string | null; is_mine: boolean };
  messages: Msg[];
  pendingEscalation: PendingEscalation | null;
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
  const atBottomRef = useRef(true);
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
          "id, customer_name, customer_phone, last_inbound_at, handler_mode, assigned_to, unread_count"
        )
        .eq("id", id!)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv) throw new Error("Conversation not found");

      const [msgsRes, assigneeRes, escalationRes] = await Promise.all([
        supabase
          .from("messages")
          .select("id, role, content, message_type, created_at, twilio_status")
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
        // Any pending escalation approval for this conversation drives the
        // red "needs manager decision" banner in the chat header.
        supabase
          .from("orders")
          .select("id, created_at, escalation_reason, details")
          .eq("conversation_id", id!)
          .eq("type", "escalation")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (msgsRes.error) throw msgsRes.error;

      const esc = (escalationRes.data ?? null) as {
        id: string;
        created_at: string;
        escalation_reason: string | null;
        details: string | null;
      } | null;

      return {
        conversation: {
          ...(conv as ConvRow),
          assignee_name: (assigneeRes.data?.full_name as string | null) ?? null,
          is_mine: conv.assigned_to === teamMemberId,
        },
        messages: (msgsRes.data ?? []) as Msg[],
        pendingEscalation: esc
          ? {
              id: esc.id,
              created_at: esc.created_at,
              reason_code: esc.escalation_reason,
              message: esc.details,
            }
          : null,
      };
    },
  });

  const conv = query.data?.conversation;
  const messages = query.data?.messages ?? [];
  const pendingEscalation = query.data?.pendingEscalation ?? null;

  // Realtime: append new messages and apply twilio_status transitions
  // directly to the cache so read-receipt ticks update without a refetch.
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
        (payload) => {
          const msg = payload.new as Msg;
          qc.setQueryData<ConvPayload>(queryKey, (prev) => {
            if (!prev) return prev;
            if (prev.messages.some((m) => m.id === msg.id)) return prev;
            return { ...prev, messages: [...prev.messages, msg] };
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const msg = payload.new as Msg;
          qc.setQueryData<ConvPayload>(queryKey, (prev) => {
            if (!prev) return prev;
            const idx = prev.messages.findIndex((m) => m.id === msg.id);
            if (idx === -1) return prev;
            const next = prev.messages.slice();
            next[idx] = { ...next[idx], ...msg };
            return { ...prev, messages: next };
          });
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
        (payload) => {
          const row = payload.new as ConvRow;
          qc.setQueryData<ConvPayload>(queryKey, (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              conversation: {
                ...prev.conversation,
                ...row,
                is_mine: row.assigned_to === teamMemberId,
              },
            };
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          // New escalation inserted, or status flipped to approved/resolved.
          // Patch the banner without a full refetch.
          qc.setQueryData<ConvPayload>(queryKey, (prev) => {
            if (!prev) return prev;
            const row = payload.new as {
              id?: string;
              type?: string;
              status?: string;
              created_at?: string;
              escalation_reason?: string | null;
              details?: string | null;
            } | null;
            const isPendingEscalation =
              row?.type === "escalation" && row?.status === "pending";
            if (isPendingEscalation && row?.id && row.created_at) {
              return {
                ...prev,
                pendingEscalation: {
                  id: row.id,
                  created_at: row.created_at,
                  reason_code: row.escalation_reason ?? null,
                  message: row.details ?? null,
                },
              };
            }
            // Any other transition (resolved, dismissed, replied) clears the
            // banner if it referred to this order.
            if (
              prev.pendingEscalation &&
              (payload.old as { id?: string } | null)?.id ===
                prev.pendingEscalation.id
            ) {
              return { ...prev, pendingEscalation: null };
            }
            return prev;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, qc, queryKey, teamMemberId]);

  // Initial jump-to-bottom on first load. For subsequent messages we rely on
  // FlatList's onContentSizeChange, which only re-pins when the user is
  // already at the bottom (so history-scrollers aren't yanked around).
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (!didInitialScrollRef.current && messages.length > 0) {
      didInitialScrollRef.current = true;
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [messages.length]);

  // --- Mark-as-read on scroll-to-bottom -----------------------------------
  // We clear unread_count + bump last_read_at only when the user actually
  // sees the bottom of the chat. The webhook keeps incrementing as new
  // customer messages arrive; if another one lands while the user is still
  // at the bottom, the next onMomentumScrollEnd / onContentSizeChange fires
  // and we clear again.
  //
  // We guard against echoing a zero back to our own cache patcher (which
  // would fight the realtime increment) by only writing when the cached
  // value is > 0.
  const markReadIfAtBottom = useCallback(
    async (atBottom: boolean) => {
      if (!id || !atBottom) return;
      const cached = qc.getQueryData<ConvPayload>(queryKey);
      const currentUnread = cached?.conversation.unread_count ?? 0;
      if (currentUnread === 0) return;

      // Optimistic local clear so the badge disappears immediately.
      qc.setQueryData<ConvPayload>(queryKey, (prev) =>
        prev
          ? {
              ...prev,
              conversation: {
                ...prev.conversation,
                unread_count: 0,
                last_read_at: new Date().toISOString(),
              },
            }
          : prev
      );
      if (restaurantId) {
        qc.setQueryData<
          Array<{ id: string; unread_count: number } & Record<string, unknown>>
        >(
          ["inbox", restaurantId, teamMemberId],
          (prev) =>
            prev?.map((c) =>
              c.id === id ? { ...c, unread_count: 0 } : c
            ) as typeof prev
        );
      }

      try {
        await supabase
          .from("conversations")
          .update({
            unread_count: 0,
            last_read_at: new Date().toISOString(),
          })
          .eq("id", id);
      } catch (err) {
        console.warn("[chat] mark-read failed:", err);
        // If the server call fails we just wait — the next scroll-to-bottom
        // will retry, and the realtime stream will reconcile if another
        // device/window owns this conversation.
      }
    },
    [id, qc, queryKey, restaurantId, teamMemberId]
  );

  // Clear on mount once the cached conversation loads.
  useEffect(() => {
    if (!conv) return;
    if (conv.unread_count > 0) {
      // Defer until after initial scrollToEnd finishes.
      const t = setTimeout(() => markReadIfAtBottom(true), 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [conv, markReadIfAtBottom]);

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
        <EscalationBanner escalation={pendingEscalation} />
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
          onScroll={({ nativeEvent }) => {
            const { contentOffset, contentSize, layoutMeasurement } =
              nativeEvent;
            const distanceFromBottom =
              contentSize.height - layoutMeasurement.height - contentOffset.y;
            const atBottom = distanceFromBottom <= 40;
            atBottomRef.current = atBottom;
            if (atBottom) void markReadIfAtBottom(true);
          }}
          scrollEventThrottle={200}
          onContentSizeChange={() => {
            // A new message pushed content height. If we were already at the
            // bottom, re-pin + clear the freshly incremented unread counter.
            // If the user is scrolled up reading older messages, leave them
            // alone — the badge stays so they know a new message arrived.
            if (atBottomRef.current) {
              listRef.current?.scrollToEnd({ animated: true });
              void markReadIfAtBottom(true);
            }
          }}
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
        <View className="mt-1 flex-row-reverse items-center gap-1.5">
          <Text
            className={`text-[11px] ${
              isCustomer ? "text-stone-400" : "text-emerald-50"
            }`}
          >
            {format(new Date(message.created_at), "HH:mm")}
          </Text>
          {!isCustomer ? <DeliveryTicks status={message.twilio_status} /> : null}
        </View>
      </View>
    </View>
  );
}

// Red banner in the chat header when a pending escalation/approval exists for
// this conversation. Lets the owner see at a glance that their intervention is
// required — the approvals tab is still the place to act, but the signal here
// means owners don't have to cross-reference screens.
function EscalationBanner({
  escalation,
}: {
  escalation: PendingEscalation | null;
}) {
  if (!escalation) return null;
  const reasonLabel = escalationReasonLabel(escalation.reason_code);
  const tone = escalationReasonTone(escalation.reason_code);
  const toneBg =
    tone === "danger" ? "bg-red-50" : tone === "warn" ? "bg-amber-50" : "bg-indigo-50";
  const toneBorder =
    tone === "danger"
      ? "border-red-200"
      : tone === "warn"
      ? "border-amber-200"
      : "border-indigo-200";
  const toneFg =
    tone === "danger"
      ? "text-red-900"
      : tone === "warn"
      ? "text-amber-900"
      : "text-indigo-900";
  const toneIcon =
    tone === "danger" ? "#991B1B" : tone === "warn" ? "#B45309" : "#3730A3";
  const ageLabel = formatDistanceToNowLocal(escalation.created_at);
  return (
    <View className={`mt-2 rounded-lg border px-3 py-2 ${toneBg} ${toneBorder}`}>
      <View className="flex-row-reverse items-start gap-2">
        <Ionicons name="shield-checkmark" size={18} color={toneIcon} />
        <View className="flex-1">
          <View className="flex-row-reverse flex-wrap items-center gap-2">
            <Text className={`text-right text-sm font-semibold ${toneFg}`}>
              طلب تصعيد بانتظار قرارك
            </Text>
            <Text
              className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${toneBg} ${toneFg}`}
            >
              {reasonLabel}
            </Text>
            <Text className="text-[11px] text-stone-500">{ageLabel}</Text>
          </View>
          {escalation.message ? (
            <Text
              numberOfLines={2}
              className="mt-1 text-right text-xs leading-5 text-stone-700"
              selectable
            >
              {escalation.message}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function formatDistanceToNowLocal(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ar });
}

// WhatsApp-style delivery ticks for agent-sent messages.
//   queued/sending → clock icon
//   sent           → single ✓
//   delivered      → double ✓✓ (light)
//   read           → double ✓✓ (sky blue, matches WA)
//   failed         → red warning triangle
function DeliveryTicks({ status }: { status: TwilioStatus }) {
  if (status === "failed") {
    return <Ionicons name="alert-circle" size={13} color="#FCA5A5" />;
  }
  if (status === "read") {
    return <Ionicons name="checkmark-done" size={14} color="#7DD3FC" />;
  }
  if (status === "delivered") {
    return <Ionicons name="checkmark-done" size={14} color="#D1FAE5" />;
  }
  if (status === "sent") {
    return <Ionicons name="checkmark" size={13} color="#D1FAE5" />;
  }
  // queued, sending, null → pending
  return <Ionicons name="time-outline" size={12} color="#A7F3D0" />;
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
      <View className="border-t border-stone-200 bg-[#FFFDF8] px-3 pb-4 pt-3">
        <View className="mb-3 flex-row-reverse items-center gap-2">
          <View className="h-9 w-9 items-center justify-center rounded-lg bg-red-50">
            <Ionicons name="hand-left-outline" size={18} color={managerColors.danger} />
          </View>
          <View className="flex-1">
            <Text className="text-right text-sm font-bold text-[#151515]">
              المحادثة غير مستلمة
            </Text>
            <Text className="mt-0.5 text-right text-xs text-stone-500">
              اختاري جهة الاستلام قبل الرد على العميل.
            </Text>
          </View>
        </View>
        <View className="flex-row-reverse gap-2">
          <Pressable
            onPress={() => onClaim("human")}
            disabled={claiming !== null}
            className="flex-1 items-center rounded-lg bg-[#128C5B] py-3.5"
            style={premiumShadow}
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
      <View className="border-t border-stone-200 bg-[#FFFDF8] px-3 pb-4 pt-3">
        {expired && (
          <View className="mb-2 flex-row-reverse items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <Ionicons name="warning-outline" size={17} color={managerColors.warning} />
            <Text className="flex-1 text-right text-xs leading-5 text-amber-800">
              انتهت نافذة الرد المجاني. تأكدي من سياسة قوالب واتساب قبل الإرسال.
            </Text>
          </View>
        )}
        {pendingFile && (
          <View className="mb-2 flex-row-reverse items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
            <Ionicons
              name={isImage ? "image-outline" : "document-outline"}
              size={18}
              color={managerColors.muted}
            />
            <Text
              className="flex-1 text-right text-xs text-stone-700"
              numberOfLines={1}
            >
              {pendingFile.name}
            </Text>
            <Pressable
              onPress={onClearPendingFile}
              disabled={sending}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={managerColors.muted} />
            </Pressable>
          </View>
        )}
        <View className="flex-row-reverse items-end gap-2">
          <Pressable
            onPress={onPickImage}
            disabled={sending || !!pendingFile}
            hitSlop={6}
            className="h-11 w-11 items-center justify-center rounded-lg bg-stone-100"
          >
            <Ionicons
              name="image-outline"
              size={20}
              color={sending || !!pendingFile ? "#A8A29E" : managerColors.muted}
            />
          </Pressable>
          <Pressable
            onPress={onPickDocument}
            disabled={sending || !!pendingFile}
            hitSlop={6}
            className="h-11 w-11 items-center justify-center rounded-lg bg-stone-100"
          >
            <Ionicons
              name="attach-outline"
              size={20}
              color={sending || !!pendingFile ? "#A8A29E" : managerColors.muted}
            />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={pendingFile ? "أضيفي تعليقًا (اختياري)..." : "اكتبي ردك..."}
            placeholderTextColor="#8A877F"
            className="min-h-11 max-h-28 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-right text-[#151515]"
            multiline
          />
          <Pressable
            onPress={onSend}
            disabled={sending || !canSend}
            className={`h-11 min-w-16 items-center justify-center rounded-lg px-4 ${
              sending || !canSend ? "bg-stone-300" : "bg-[#128C5B]"
            }`}
            style={!sending && canSend ? premiumShadow : undefined}
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
      <View className="border-t border-stone-200 bg-[#FFFDF8] px-3 pb-4 pt-3">
        <View className="mb-3 flex-row-reverse items-center gap-2">
          <View className="h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
            <Ionicons name="hardware-chip-outline" size={18} color={managerColors.bot} />
          </View>
          <View className="flex-1">
            <Text className="text-right text-sm font-bold text-[#151515]">
              البوت يدير المحادثة
            </Text>
            <Text className="mt-0.5 text-right text-xs text-stone-500">
              استلميها يدويًا إذا احتاج العميل متابعة بشرية.
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => onClaim("human")}
          disabled={claiming !== null}
          className="items-center rounded-lg bg-[#128C5B] py-3.5"
          style={premiumShadow}
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
    <View className="border-t border-stone-200 bg-[#FFFDF8] px-3 pb-4 pt-3">
      <View className="flex-row-reverse items-center gap-2 rounded-lg bg-stone-50 px-3 py-3">
        <Ionicons name="lock-closed-outline" size={18} color={managerColors.muted} />
        <Text className="flex-1 text-right text-xs leading-5 text-stone-500">
          هذه المحادثة مستلمة من موظف آخر. يمكنك المتابعة للقراءة فقط.
        </Text>
      </View>
    </View>
  );
}
