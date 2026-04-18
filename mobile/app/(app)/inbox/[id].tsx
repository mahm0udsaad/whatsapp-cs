import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  claimConversation,
  getInboxConversation,
  replyToConversation,
} from "../../../lib/api";
import { supabase } from "../../../lib/supabase";
import { useSessionStore } from "../../../lib/session-store";

type Msg = {
  id: string;
  role: "customer" | "agent" | "system";
  content: string;
  message_type: string;
  created_at: string;
};

type ConvPayload = {
  conversation: {
    id: string;
    customer_name: string | null;
    customer_phone: string;
    last_inbound_at: string | null;
    handler_mode: "unassigned" | "human" | "bot";
    assigned_to: string | null;
    assignee_name: string | null;
    is_mine: boolean;
  };
  messages: Msg[];
};

export default function ConversationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const member = useSessionStore((s) => s.activeMember);
  const listRef = useRef<FlatList<Msg>>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [claiming, setClaiming] = useState<"human" | "bot" | null>(null);

  const queryKey = useMemo(() => ["conv", id], [id]);

  const query = useQuery({
    queryKey,
    enabled: !!id,
    queryFn: async (): Promise<ConvPayload> => {
      const res = (await getInboxConversation(id!)) as ConvPayload;
      return res;
    },
  });

  const conv = query.data?.conversation;
  const messages = query.data?.messages ?? [];

  // Realtime: append new messages without a round-trip.
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
    // Auto-scroll on new messages.
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
      <SafeAreaView className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const expired =
    !!conv.last_inbound_at &&
    Date.now() - new Date(conv.last_inbound_at).getTime() > 24 * 60 * 60 * 1000;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["bottom"]}>
      <View className="flex-row-reverse items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
        <Pressable onPress={() => router.back()}>
          <Text className="text-brand text-sm">رجوع</Text>
        </Pressable>
        <View className="flex-1 items-center">
          <Text className="text-base font-semibold" numberOfLines={1}>
            {conv.customer_name || conv.customer_phone}
          </Text>
          <Text className="text-[11px] text-gray-500">{conv.customer_phone}</Text>
        </View>
        <View className="w-12" />
      </View>

      {(expired || conv.assignee_name) && (
        <View className="flex-row-reverse items-center gap-2 border-b border-gray-100 bg-white px-4 py-2">
          {conv.assignee_name && (
            <Text className="text-[11px] text-gray-600">
              {conv.handler_mode === "human" ? "مستلمة من" : "موكلة للبوت عبر"}{" "}
              {conv.assignee_name}
            </Text>
          )}
          {expired && (
            <Text className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
              خارج نافذة 24س
            </Text>
          )}
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ListEmptyComponent={
            <View className="items-center py-20">
              <Text className="text-gray-500">لا توجد رسائل بعد</Text>
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
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message }: { message: Msg }) {
  const isCustomer = message.role === "customer";
  const isSystem = message.role === "system";
  return (
    <View
      className={`my-1 flex ${isCustomer ? "items-start" : "items-end"}`}
    >
      <View
        className={`max-w-[80%] rounded-2xl px-3 py-2 ${
          isCustomer
            ? "bg-white border border-gray-100"
            : isSystem
            ? "bg-amber-50"
            : "bg-emerald-600"
        }`}
      >
        <Text
          className={`text-sm ${isCustomer || isSystem ? "text-gray-900" : "text-white"}`}
        >
          {message.content}
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
}: {
  mode: "unassigned" | "human" | "bot";
  isMine: boolean;
  claiming: "human" | "bot" | null;
  sending: boolean;
  text: string;
  setText: (v: string) => void;
  onClaim: (m: "human" | "bot") => void;
  onSend: () => void;
}) {
  if (mode === "unassigned") {
    return (
      <View className="border-t border-gray-100 bg-white p-3">
        <Pressable
          onPress={() => onClaim("human")}
          disabled={claiming !== null}
          className="mb-2 items-center rounded-xl bg-emerald-600 py-3"
        >
          {claiming === "human" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold">استلام ورد العميل</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => onClaim("bot")}
          disabled={claiming !== null}
          className="items-center rounded-xl bg-indigo-600 py-3"
        >
          {claiming === "bot" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold">استلام وتوكيل البوت</Text>
          )}
        </Pressable>
      </View>
    );
  }

  if (mode === "human" && isMine) {
    return (
      <View className="flex-row-reverse items-center gap-2 border-t border-gray-100 bg-white p-3">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="اكتبي ردك…"
          className="flex-1 rounded-xl bg-gray-100 px-3 py-2 text-right"
          multiline
        />
        <Pressable
          onPress={onSend}
          disabled={sending || !text.trim()}
          className={`rounded-xl px-4 py-2 ${
            sending || !text.trim() ? "bg-gray-300" : "bg-emerald-600"
          }`}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold">إرسال</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View className="border-t border-gray-100 bg-white p-3">
      <Text className="text-center text-xs text-gray-500">
        {mode === "human"
          ? "هذه المحادثة مستلمة من موظف آخر"
          : "هذه المحادثة موكلة للبوت"}
      </Text>
    </View>
  );
}
