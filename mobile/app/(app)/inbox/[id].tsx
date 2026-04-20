import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
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
  createLabel,
  getTeamRoster,
  listLabels,
  reassignConversation,
  replyToConversation,
  setConversationArchived,
  setConversationLabels,
  uploadConversationMedia,
  type ConversationLabel,
  type LabelColor,
  type ReplyAttachment,
  type TeamMemberRosterRow,
} from "../../../lib/api";
import { labelChipClasses, labelColorOrder } from "../../../lib/label-colors";
import { supabase } from "../../../lib/supabase";
import { useSessionStore } from "../../../lib/session-store";
import { isManager } from "../../../lib/roles";
import { qk } from "../../../lib/query-keys";
import {
  SkeletonBlock,
  managerColors,
  premiumShadow,
  softShadow,
} from "../../../components/manager-ui";
import {
  escalationReasonLabel,
  escalationReasonTone,
} from "../../../lib/escalation-labels";
import { setActiveConv } from "../../../lib/active-conv";

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
  delivery_status: TwilioStatus;
};

type ConvRow = {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  last_inbound_at: string | null;
  handler_mode: "unassigned" | "human" | "bot";
  assigned_to: string | null;
  unread_count: number;
  archived_at: string | null;
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
  const didInitialScrollRef = useRef(false);
  const listLaidOutRef = useRef(false);
  const contentReadyRef = useRef(false);
  const prevMsgCountRef = useRef(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [claiming, setClaiming] = useState<"human" | "bot" | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
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
    // Optimistic: update the cached conversation + inbox row immediately so
    // the modal dismisses to a screen that already reflects the new state.
    // We snapshot the previous value and return it via the mutation context
    // so onError can roll back without extra fetches.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["conv", id] });
      const prevConv = qc.getQueryData<ConvPayload>(["conv", id]);
      const prevList = restaurantId
        ? qc.getQueryData<
            Array<
              { id: string; handler_mode: string; assigned_to: string | null } & Record<
                string,
                unknown
              >
            >
          >(["inbox", restaurantId, teamMemberId])
        : null;

      const nextMode: "unassigned" | "human" | "bot" = input.forceBot
        ? "bot"
        : input.unassign
        ? "unassigned"
        : "human";
      const nextAssigned: string | null = input.forceBot
        ? null
        : input.unassign
        ? null
        : input.assignToTeamMemberId ?? null;

      if (prevConv) {
        qc.setQueryData<ConvPayload>(["conv", id], {
          ...prevConv,
          conversation: {
            ...prevConv.conversation,
            handler_mode: nextMode,
            assigned_to: nextAssigned,
            is_mine: nextAssigned === teamMemberId,
            // `assignee_name` will be refreshed by the realtime UPDATE; clear
            // it for bot/unassigned so the header chip reads correctly.
            assignee_name:
              nextMode === "human"
                ? prevConv.conversation.assignee_name ?? null
                : null,
          },
        });
      }

      if (restaurantId && prevList) {
        qc.setQueryData(
          ["inbox", restaurantId, teamMemberId],
          prevList.map((c) =>
            c.id === input.conversationId
              ? { ...c, handler_mode: nextMode, assigned_to: nextAssigned }
              : c
          )
        );
      }

      // Close the modal the moment the mutation starts — the server round
      // trip will finish on its own.
      setReassignOpen(false);

      return { prevConv, prevList };
    },
    onError: (e: unknown, _input, ctx) => {
      // Restore the two caches we touched in onMutate.
      if (ctx?.prevConv) {
        qc.setQueryData<ConvPayload>(["conv", id], ctx.prevConv);
      }
      if (restaurantId && ctx?.prevList) {
        qc.setQueryData(
          ["inbox", restaurantId, teamMemberId],
          ctx.prevList
        );
      }
      Alert.alert("خطأ", e instanceof Error ? e.message : "تعذّر التحويل");
    },
    onSettled: () => {
      // Leave KPIs to the standard 20s cadence — the specific row patches
      // above already cover the visible surfaces. Invalidating here would
      // cause a second fetch for no user-visible gain.
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
          "id, customer_name, customer_phone, last_inbound_at, handler_mode, assigned_to, unread_count, archived_at"
        )
        .eq("id", id!)
        .maybeSingle();
      if (convErr) throw convErr;
      if (!conv) throw new Error("Conversation not found");

      const [msgsRes, assigneeRes, escalationRes] = await Promise.all([
        supabase
          .from("messages")
          .select("id, role, content, message_type, created_at, delivery_status")
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
  const latestMessageId =
    messages.length > 0 ? messages[messages.length - 1]?.id : null;

  // Realtime: append new messages and apply delivery_status transitions
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

  // Track "this is the conversation the user is looking at right now" so the
  // push notification handler can suppress the in-app banner for inbound
  // messages on THIS conversation (the realtime cache-patcher already shows
  // them — a banner on top would be noise).
  useEffect(() => {
    if (!id) return;
    setActiveConv(id);
    return () => setActiveConv(null);
  }, [id]);

  useEffect(() => {
    didInitialScrollRef.current = false;
    contentReadyRef.current = false;
    atBottomRef.current = true;
  }, [id]);

  const scrollToLatestMessage = useCallback((animated: boolean) => {
    // Request animation frame ensures we wait for the next render tick before scrolling
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
      // A small fallback timeout catches any straggling layout shifts (like text wrapping)
      if (!animated) {
        setTimeout(() => {
          listRef.current?.scrollToEnd({ animated: false });
        }, 100);
      }
    });
  }, []);

  // Initial jump-to-bottom on first load. Wait for both layout and content
  // measurement; a timeout alone can fire before FlatList knows its height.
  const tryInitialScrollToLatest = useCallback(() => {
    if (
      didInitialScrollRef.current ||
      messages.length === 0 ||
      !listLaidOutRef.current ||
      !contentReadyRef.current
    ) {
      return false;
    }
    didInitialScrollRef.current = true;
    atBottomRef.current = true;
    scrollToLatestMessage(false);
    return true;
  }, [messages.length, scrollToLatestMessage]);

  useEffect(() => {
    tryInitialScrollToLatest();
  }, [tryInitialScrollToLatest]);

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
          ({ id: string; unread_count: number } & Record<string, unknown>)[]
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

  // When opening a chat, messages may already be in the React Query cache by
  // the time FlatList mounts. In that path onContentSizeChange is not a
  // reliable first-scroll trigger, so schedule a few post-layout attempts.
  useEffect(() => {
    if (!id || !latestMessageId || didInitialScrollRef.current) return;

    didInitialScrollRef.current = true;
    atBottomRef.current = true;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      listRef.current?.scrollToEnd({ animated: false });
    };

    const interaction = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(run);
      timers.push(setTimeout(run, 80));
      timers.push(
        setTimeout(() => {
          run();
          void markReadIfAtBottom(true);
        }, 240)
      );
    });

    return () => {
      interaction.cancel();
      timers.forEach(clearTimeout);
    };
  }, [id, latestMessageId, markReadIfAtBottom]);

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

      // Snapshot the previous conversation shape so we can roll back on
      // failure. Flip handler_mode + assigned_to immediately so the Footer
      // switches from "unassigned" / "bot" to the send composer (or vice
      // versa) without waiting on the API.
      const prev = qc.getQueryData<ConvPayload>(queryKey);
      const prevConvRow = prev?.conversation ?? null;

      qc.setQueryData<ConvPayload>(queryKey, (p) => {
        if (!p) return p;
        const next = {
          ...p.conversation,
          handler_mode: mode,
          assigned_to: mode === "human" ? teamMemberId : null,
          is_mine: mode === "human",
        };
        return { ...p, conversation: next };
      });

      // Also patch the inbox list row so the row colour / badge reflects the
      // new state before the next refetch.
      if (member?.restaurant_id) {
        qc.setQueryData<
          Array<{ id: string; handler_mode: string; assigned_to: string | null } & Record<string, unknown>>
        >(
          ["inbox", member.restaurant_id, teamMemberId],
          (list) =>
            list?.map((c) =>
              c.id === id
                ? {
                    ...c,
                    handler_mode: mode,
                    assigned_to: mode === "human" ? teamMemberId : null,
                  }
                : c
            ) as typeof list
        );
      }

      try {
        await claimConversation(id, mode);
        // No invalidation — the realtime UPDATE subscription on
        // conversations will reconcile any server-side diffs. Invalidating
        // would cause a flicker as the fetch races the socket.
      } catch (e: unknown) {
        // Roll back the conversation row we patched above.
        if (prev && prevConvRow) {
          qc.setQueryData<ConvPayload>(queryKey, (p) =>
            p ? { ...p, conversation: prevConvRow } : p
          );
        }
        if (member?.restaurant_id) {
          qc.invalidateQueries({
            queryKey: ["inbox", member.restaurant_id],
          });
        }
        const err = e as { message?: string };
        Alert.alert("تعذّر الاستلام", err?.message ?? "حاولي مرة أخرى");
      } finally {
        setClaiming(null);
      }
    },
    [id, qc, queryKey, teamMemberId, member?.restaurant_id]
  );

  const onSend = useCallback(async () => {
    if (!id) return;
    const body = text.trim();
    if (!body && !pendingFile) return;

    // --- Optimistic append ---------------------------------------------------
    // Insert a placeholder message into the cache immediately so the bubble
    // appears the instant the user taps send. Later:
    //   - on success: replace the placeholder with the server's real row
    //   - on failure: remove the placeholder and restore the input text
    // The realtime INSERT handler dedupes by id, so the real row arriving
    // from the socket won't double-render.
    const tempId = `tmp:${Date.now()}`;
    const hadText = body.length > 0;
    const hadAttachment = !!pendingFile;
    const optimisticMsg: Msg = {
      id: tempId,
      role: "agent",
      // If the send has only an attachment and no caption, show a placeholder
      // line so the bubble isn't empty. The server will replace it.
      content: hadText
        ? body
        : pendingFile
        ? pendingFile.type.startsWith("image/")
          ? "📷 صورة"
          : "📎 ملف"
        : "",
      message_type: pendingFile
        ? pendingFile.type.startsWith("image/")
          ? "image"
          : "document"
        : "text",
      created_at: new Date().toISOString(),
      delivery_status: "sending",
    };

    qc.setQueryData<ConvPayload>(queryKey, (prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : prev
    );

    // Clear input/attachment right away so the UX feels snappy. If the send
    // fails we restore the text.
    setText("");
    setPendingFile(null);
    setSending(true);

    try {
      let attachment: ReplyAttachment | undefined;
      if (hadAttachment && pendingFile) {
        setUploading(true);
        attachment = await uploadConversationMedia(id, {
          uri: pendingFile.uri,
          name: pendingFile.name,
          type: pendingFile.type,
        });
        setUploading(false);
      }
      const resp = (await replyToConversation(id, body, attachment)) as {
        message?: Msg;
      } | null;
      const real = resp?.message ?? null;

      qc.setQueryData<ConvPayload>(queryKey, (prev) => {
        if (!prev) return prev;
        const withoutTemp = prev.messages.filter((m) => m.id !== tempId);
        if (real && !withoutTemp.some((m) => m.id === real.id)) {
          return { ...prev, messages: [...withoutTemp, real] };
        }
        return { ...prev, messages: withoutTemp };
      });
    } catch (e: unknown) {
      // Roll back: drop the optimistic row, restore the typed text + file.
      qc.setQueryData<ConvPayload>(queryKey, (prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.filter((m) => m.id !== tempId),
            }
          : prev
      );
      if (hadText) setText(body);
      // We can't restore the picker result (uri may be stale), so just warn
      // the user the attachment was dropped.
      const err = e as { message?: string };
      Alert.alert(
        "تعذّر الإرسال",
        err?.message ?? "حاولي مرة أخرى"
      );
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
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["top", "bottom"]}>
      <View className="border-b border-[#E6E8EC] bg-white px-3 pb-2 pt-2 z-10">
        <View
          className="flex-row-reverse items-center gap-2 rounded-lg bg-[#052E26] px-2 py-2"
          style={premiumShadow}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-9 w-9 items-center justify-center rounded-lg bg-white/10"
          >
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </Pressable>
          <View className="h-9 w-9 items-center justify-center rounded-lg bg-white/12">
            <Ionicons name="person" size={18} color="#B7F7D8" />
          </View>
          <View className="flex-1 justify-center">
            <Text
              className="text-right text-sm font-bold text-white"
              numberOfLines={1}
            >
              {conv.customer_name || conv.customer_phone}
            </Text>
            {conv.customer_name ? (
              <Text className="mt-0.5 text-right text-[10px] text-emerald-100/80" selectable>
                {conv.customer_phone}
              </Text>
            ) : null}
          </View>
          {manager ? (
            <Pressable
              onPress={() => setReassignOpen(true)}
              hitSlop={12}
              className="h-9 w-9 items-center justify-center rounded-lg bg-white/10"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>
        <View
          className={`mt-1.5 rounded-lg border px-2 py-1.5 ${
            windowState.tone === "danger"
              ? "border-red-200 bg-red-50"
              : windowState.tone === "warning"
              ? "border-amber-200 bg-amber-50"
              : windowState.tone === "success"
              ? "border-emerald-200 bg-emerald-50"
              : "border-[#E6E8EC] bg-[#F6F7F9]"
          }`}
        >
          <View className="flex-row-reverse items-center gap-2">
            <Ionicons
              name={
                windowState.tone === "success"
                  ? "checkmark-circle"
                  : windowState.tone === "neutral"
                  ? "information-circle"
                  : "time"
              }
              size={16}
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
            <Text
              className={`flex-1 text-right text-xs font-semibold ${
                windowState.tone === "danger"
                  ? "text-red-800"
                  : windowState.tone === "warning"
                  ? "text-amber-800"
                  : windowState.tone === "success"
                  ? "text-emerald-900"
                  : "text-[#344054]"
              }`}
              numberOfLines={1}
            >
              {windowState.title}
            </Text>
            <Text
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
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
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          onLayout={() => {
            listLaidOutRef.current = true;
            tryInitialScrollToLatest();
          }}
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
            contentReadyRef.current = true;
            const didInitialScroll = tryInitialScrollToLatest();
            if (didInitialScroll) {
              void markReadIfAtBottom(true);
              prevMsgCountRef.current = messages.length;
              return;
            }
            // A new message pushed content height. If we were already at the
            // bottom, re-pin + clear the freshly incremented unread counter.
            if (atBottomRef.current && messages.length > prevMsgCountRef.current) {
              scrollToLatestMessage(true);
              void markReadIfAtBottom(true);
            }
            prevMsgCountRef.current = messages.length;
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
            className="rounded-t-lg bg-white p-4 pb-8"
          >
            <Text className="text-right text-lg font-bold text-[#0B0F13]">
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
              {/* Labels + archive — available regardless of manager role */}
              <Pressable
                onPress={() => {
                  setReassignOpen(false);
                  setLabelsOpen(true);
                }}
                className="flex-row-reverse items-center justify-between rounded-lg border border-stone-200 bg-stone-50 p-3"
              >
                <Text className="text-right text-sm font-semibold text-stone-800">
                  إدارة التسميات
                </Text>
                <Ionicons name="pricetags-outline" size={20} color="#44403C" />
              </Pressable>
              <ChatArchiveToggle
                conversationId={id as string}
                isArchived={!!conv?.archived_at}
                restaurantId={restaurantId}
                teamMemberId={teamMemberId}
                onDone={() => setReassignOpen(false)}
              />
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

      {/* Labels picker */}
      <LabelsPickerModal
        visible={labelsOpen}
        conversationId={id as string}
        restaurantId={restaurantId}
        onClose={() => setLabelsOpen(false)}
      />
    </SafeAreaView>
  );
}

function ChatSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-[#F6F7F9]" edges={["top", "bottom"]}>
      <View className="border-b border-[#E6E8EC] bg-white px-3 pb-2 pt-2 z-10">
        <View className="flex-row-reverse items-center gap-2">
          <SkeletonBlock className="h-9 w-9 rounded-lg" />
          <SkeletonBlock className="h-9 w-9 rounded-lg" />
          <View className="flex-1 items-end gap-1.5">
            <SkeletonBlock className="h-3.5 w-32 rounded-lg" />
            <SkeletonBlock className="h-2.5 w-24 rounded-lg" />
          </View>
          <SkeletonBlock className="h-9 w-9 rounded-lg" />
        </View>
        <View className="mt-1.5 rounded-lg border border-[#E6E8EC] bg-[#F6F7F9] px-2 py-2">
          <View className="flex-row-reverse items-center gap-2">
            <SkeletonBlock className="h-4 w-4 rounded-lg" />
            <SkeletonBlock className="h-3 w-40 rounded-lg" />
            <View className="flex-1" />
            <SkeletonBlock className="h-4 w-16 rounded-lg" />
          </View>
        </View>
      </View>

      <View className="flex-1 px-4 py-4">
        <View className="mb-5 items-center">
          <SkeletonBlock className="h-6 w-28 rounded-lg bg-white" />
        </View>

        <View className="mb-4 items-start">
          <SkeletonBlock className="mb-1 h-3 w-12 rounded-lg" />
          <SkeletonBlock className="h-14 w-36 rounded-lg bg-white" />
        </View>

        <View className="mb-4 items-start">
          <SkeletonBlock className="mb-1 h-3 w-12 rounded-lg" />
          <SkeletonBlock className="h-12 w-56 rounded-lg bg-white" />
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

      <View className="border-t border-[#E6E8EC] bg-white px-3 pb-4 pt-3">
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
      <View className="rounded-lg bg-gray-200/60 px-3 py-1">
        <Text className="text-[11px] font-semibold text-gray-500">
          {format(new Date(date), "EEEE d MMMM", { locale: ar })}
        </Text>
      </View>
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
    <View className={`my-1 flex ${isCustomer ? "items-start" : "items-end"}`}>
      <View
        className={`max-w-[84%] px-3 py-2 ${
          isCustomer
            ? "rounded-2xl rounded-tl-md border border-[#E6E8EC] bg-white"
            : "rounded-2xl rounded-tr-md bg-[#00A884]"
        }`}
        style={isCustomer ? softShadow : premiumShadow}
      >
        <Text
          className={`text-right text-sm leading-5 ${
            isCustomer ? "text-[#0B0F13]" : "text-white"
          }`}
          selectable
        >
          {message.content}
        </Text>
        <View className="mt-1 flex-row-reverse items-center gap-1.5">
          <Text
            className={`text-[10px] ${
              isCustomer ? "text-[#98A2B3]" : "text-emerald-100"
            }`}
          >
            {format(new Date(message.created_at), "HH:mm")}
          </Text>
          {!isCustomer ? <DeliveryTicks status={message.delivery_status} /> : null}
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
    <View className={`mt-1.5 rounded-lg border px-2 py-1.5 ${toneBg} ${toneBorder}`}>
      <View className="flex-row-reverse items-center gap-2">
        <Ionicons name="shield-checkmark" size={16} color={toneIcon} />
        <Text className={`text-right text-xs font-semibold ${toneFg}`}>
          تصعيد:
        </Text>
        <Text
          className={`flex-1 text-right text-xs ${toneFg}`}
          numberOfLines={1}
        >
          {escalation.message || reasonLabel}
        </Text>
        <Text className="text-[10px] text-[#667085]">{ageLabel}</Text>
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
      <View className="border-t border-[#E6E8EC] bg-white px-3 pb-4 pt-3">
        <View className="mb-3 flex-row-reverse items-center justify-center gap-1.5">
          <Ionicons name="hand-left-outline" size={16} color={managerColors.danger} />
          <Text className="text-right text-xs text-[#667085]">
            هذه المحادثة غير مستلمة. اختاري جهة الاستلام للرد.
          </Text>
        </View>
        <View className="flex-row-reverse gap-2">
          <Pressable
            onPress={() => onClaim("human")}
            disabled={claiming !== null}
            className="h-10 flex-1 items-center justify-center rounded-lg bg-[#00A884] px-3"
            style={premiumShadow}
          >
            {claiming === "human" ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="font-semibold text-sm text-white">استلام الآن</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => onClaim("bot")}
            disabled={claiming !== null}
            className="h-10 flex-1 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3"
          >
            {claiming === "bot" ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text className="font-semibold text-sm text-indigo-800">توكيل للبوت</Text>
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
      <View className="border-t border-[#E6E8EC] bg-white px-3 pb-4 pt-3">
        {expired && (
          <View className="mb-2 flex-row-reverse items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <Ionicons name="warning-outline" size={17} color={managerColors.warning} />
            <Text className="flex-1 text-right text-xs leading-5 text-amber-800">
              انتهت نافذة الرد المجاني. تأكدي من سياسة قوالب واتساب قبل الإرسال.
            </Text>
          </View>
        )}
        {pendingFile && (
          <View className="mb-2 flex-row-reverse items-center gap-2 rounded-lg border border-[#E6E8EC] bg-[#F6F7F9] px-3 py-2">
            <Ionicons
              name={isImage ? "image-outline" : "document-outline"}
              size={18}
              color={managerColors.muted}
            />
            <Text
              className="flex-1 text-right text-xs text-[#344054]"
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
            className="h-12 w-12 items-center justify-center rounded-lg bg-[#F2F4F7]"
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
            className="h-12 w-12 items-center justify-center rounded-lg bg-[#F2F4F7]"
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
            placeholderTextColor="#98A2B3"
            className="min-h-12 max-h-28 flex-1 rounded-lg border border-[#E6E8EC] bg-[#F6F7F9] px-3 py-2 text-right text-[#0B0F13]"
            multiline
          />
          <Pressable
            onPress={onSend}
            disabled={sending || !canSend}
            className={`h-12 min-w-16 items-center justify-center rounded-lg px-4 ${
              sending || !canSend ? "bg-[#D0D5DD]" : "bg-[#00A884]"
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
      <View className="border-t border-[#E6E8EC] bg-white px-3 pb-4 pt-3 flex-row-reverse items-center gap-3">
        <View className="flex-1">
          <View className="flex-row-reverse items-center gap-1.5">
            <Ionicons name="hardware-chip-outline" size={16} color={managerColors.bot} />
            <Text className="text-right text-sm font-bold text-[#0B0F13]">
              البوت يدير المحادثة
            </Text>
          </View>
          <Text className="mt-0.5 text-right text-xs text-[#667085]">
            استلميها يدويًا للرد على العميل.
          </Text>
        </View>
        <Pressable
          onPress={() => onClaim("human")}
          disabled={claiming !== null}
          className="h-10 px-4 items-center justify-center rounded-lg bg-[#00A884]"
          style={premiumShadow}
        >
          {claiming === "human" ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="font-semibold text-sm text-white">استلام يدوي</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View className="border-t border-[#E6E8EC] bg-white px-3 pb-4 pt-3">
      <View className="flex-row-reverse items-center gap-2 rounded-lg bg-[#F6F7F9] px-3 py-3">
        <Ionicons name="lock-closed-outline" size={18} color={managerColors.muted} />
        <Text className="flex-1 text-right text-xs leading-5 text-[#667085]">
          هذه المحادثة مستلمة من موظف آخر. يمكنك المتابعة للقراءة فقط.
        </Text>
      </View>
    </View>
  );
}

// Archive toggle button inside the chat header's management modal. Calls the
// archive API and patches the local chat + inbox caches.
function ChatArchiveToggle({
  conversationId,
  isArchived,
  restaurantId,
  teamMemberId,
  onDone,
}: {
  conversationId: string;
  isArchived: boolean;
  restaurantId: string;
  teamMemberId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () =>
      setConversationArchived(conversationId, !isArchived),
    onSuccess: (res) => {
      // Update the chat cache so header chip flips.
      qc.setQueryData<ConvPayload>(["conv", conversationId], (prev) =>
        prev
          ? {
              ...prev,
              conversation: {
                ...prev.conversation,
                archived_at: res.archived_at,
              },
            }
          : prev
      );
      // Invalidate both inbox lists so the row moves between tabs.
      qc.invalidateQueries({
        queryKey: ["inbox", restaurantId, teamMemberId, false],
      });
      qc.invalidateQueries({
        queryKey: ["inbox", restaurantId, teamMemberId, true],
      });
      onDone();
    },
    onError: (e: unknown) => {
      Alert.alert(
        "خطأ",
        e instanceof Error ? e.message : "تعذّر تحديث الأرشيف"
      );
    },
  });
  return (
    <Pressable
      disabled={mutation.isPending}
      onPress={() => mutation.mutate()}
      className="flex-row-reverse items-center justify-between rounded-lg border border-stone-200 bg-stone-50 p-3"
    >
      <Text className="text-right text-sm font-semibold text-stone-800">
        {isArchived ? "إلغاء الأرشفة" : "أرشفة المحادثة"}
      </Text>
      <Ionicons
        name={isArchived ? "archive" : "archive-outline"}
        size={20}
        color="#44403C"
      />
    </Pressable>
  );
}

// Modal with a toggleable list of all tenant labels. Tapping a row toggles
// assignment and calls the replace-set API once. Current assignments are
// loaded from the join table on open.
function LabelsPickerModal({
  visible,
  conversationId,
  restaurantId,
  onClose,
}: {
  visible: boolean;
  conversationId: string;
  restaurantId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const labelsQuery = useQuery({
    queryKey: ["labels", restaurantId],
    enabled: visible && !!restaurantId,
    staleTime: 5 * 60_000,
    queryFn: () => listLabels(),
  });
  const selectedQuery = useQuery({
    queryKey: ["conv-labels", conversationId],
    enabled: visible && !!conversationId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("conversation_label_assignments")
        .select("label_id")
        .eq("conversation_id", conversationId);
      if (error) throw error;
      return (data ?? []).map((r: { label_id: string }) => r.label_id);
    },
  });
  const [draft, setDraft] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (selectedQuery.data) setDraft(new Set(selectedQuery.data));
  }, [selectedQuery.data]);

  // Inline "create new label" form state. Hidden until the agent taps
  // the "+ تسمية جديدة" button; closes itself after a successful save.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<LabelColor>("emerald");
  const resetCreateForm = useCallback(() => {
    setCreating(false);
    setNewName("");
    setNewColor("emerald");
  }, []);
  // Reset the create form whenever the modal is dismissed so a reopen
  // starts clean.
  useEffect(() => {
    if (!visible) resetCreateForm();
  }, [visible, resetCreateForm]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const name = newName.trim();
      if (!name) throw new Error("الاسم مطلوب");
      return createLabel({ restaurantId, name, color: newColor });
    },
    onSuccess: (label) => {
      // Preselect the new label so the agent doesn't have to tap it again.
      setDraft((prev) => {
        const n = new Set(prev);
        n.add(label.id);
        return n;
      });
      qc.invalidateQueries({ queryKey: ["labels", restaurantId] });
      resetCreateForm();
    },
    onError: (e: unknown) => {
      Alert.alert(
        "تعذّر إنشاء التسمية",
        e instanceof Error ? e.message : "حدث خطأ"
      );
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () =>
      setConversationLabels(conversationId, Array.from(draft)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conv-labels", conversationId] });
      // Also nudge the inbox caches so the row chips refresh.
      qc.invalidateQueries({
        queryKey: ["inbox", restaurantId],
        exact: false,
      });
      onClose();
    },
    onError: (e: unknown) => {
      Alert.alert("خطأ", e instanceof Error ? e.message : "تعذّر الحفظ");
    },
  });

  const labels = labelsQuery.data ?? [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-lg bg-white p-4 pb-8"
        >
          <Text className="text-right text-lg font-bold text-[#0B0F13]">
            التسميات
          </Text>
          <Text className="mt-1 text-right text-xs text-[#667085]">
            اختاري التسميات التي تنطبق على هذه المحادثة.
          </Text>

          <View className="mt-4">
            {labelsQuery.isLoading || selectedQuery.isLoading ? (
              <ActivityIndicator />
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {labels.length === 0 ? (
                  <View className="items-center py-6">
                    <Text className="text-center text-sm text-[#667085]">
                      لا توجد تسميات بعد. أنشئي أول تسمية مثل &quot;بانتظار
                      الدفع&quot; أو &quot;لم يستلم بعد&quot;.
                    </Text>
                  </View>
                ) : (
                  labels.map((l: ConversationLabel) => {
                    const selected = draft.has(l.id);
                    const cls = labelChipClasses[l.color];
                    return (
                      <Pressable
                        key={l.id}
                        onPress={() =>
                          setDraft((prev) => {
                            const n = new Set(prev);
                            if (n.has(l.id)) n.delete(l.id);
                            else n.add(l.id);
                            return n;
                          })
                        }
                        className="flex-row-reverse items-center justify-between border-b border-gray-100 py-3"
                      >
                        <View className="flex-row-reverse items-center gap-2">
                          <View
                            className={`h-3 w-3 rounded-full ${cls.bg} border ${cls.border}`}
                          />
                          <Text className="text-right text-sm font-semibold text-gray-950">
                            {l.name}
                          </Text>
                        </View>
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={22}
                          color={selected ? "#00A884" : "#98A2B3"}
                        />
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>

          {/* Create new label — inline form */}
          {creating ? (
            <View className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <Text className="text-right text-xs text-[#667085]">
                اسم التسمية
              </Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="مثال: بانتظار الدفع"
                maxLength={40}
                textAlign="right"
                className="mt-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-right text-sm text-gray-950"
              />
              <Text className="mt-3 text-right text-xs text-[#667085]">
                اللون
              </Text>
              <View className="mt-2 flex-row-reverse flex-wrap gap-2">
                {labelColorOrder.map((c) => {
                  const cls = labelChipClasses[c];
                  const active = newColor === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setNewColor(c)}
                      className={`h-8 w-8 items-center justify-center rounded-full border ${cls.bg} ${active ? "border-[#00A884]" : cls.border}`}
                    >
                      {active ? (
                        <Ionicons name="checkmark" size={16} color="#00A884" />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              <View className="mt-3 flex-row-reverse gap-2">
                <Pressable
                  disabled={
                    createMutation.isPending || newName.trim().length === 0
                  }
                  onPress={() => createMutation.mutate()}
                  className={`flex-1 items-center rounded-md py-2 ${
                    newName.trim().length === 0
                      ? "bg-[#B6E5D6]"
                      : "bg-[#00A884]"
                  }`}
                >
                  {createMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="font-semibold text-white">إنشاء</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={resetCreateForm}
                  className="flex-1 items-center rounded-md border border-gray-200 py-2"
                >
                  <Text className="font-semibold text-gray-700">إلغاء</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setCreating(true)}
              className="mt-3 flex-row-reverse items-center justify-center gap-2 rounded-lg border border-dashed border-[#00A884] py-3"
            >
              <Ionicons name="add-circle-outline" size={18} color="#00A884" />
              <Text className="font-semibold text-[#00A884]">
                تسمية جديدة
              </Text>
            </Pressable>
          )}

          <View className="mt-4 flex-row-reverse gap-2">
            <Pressable
              disabled={saveMutation.isPending}
              onPress={() => saveMutation.mutate()}
              className="flex-1 items-center rounded-lg bg-[#00A884] py-3"
            >
              {saveMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="font-semibold text-white">حفظ</Text>
              )}
            </Pressable>
            <Pressable
              onPress={onClose}
              className="flex-1 items-center rounded-lg border border-gray-200 py-3"
            >
              <Text className="font-semibold text-gray-700">إلغاء</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
