"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Conversation, Message, InteractiveReply } from "@/lib/types";

interface ConversationsInboxProps {
  restaurantId: string;
  initialConversations: Conversation[];
}

export function ConversationsInbox({
  restaurantId,
  initialConversations,
}: ConversationsInboxProps) {
  const supabase = useMemo(() => createClient(), []);
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id || null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(initialConversations.length === 0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "resolved">("all");

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      if (!matchesStatus) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (c.customer_name?.toLowerCase().includes(q)) ||
        c.customer_phone.toLowerCase().includes(q)
      );
    });
  }, [conversations, searchQuery, statusFilter]);

  useEffect(() => {
    let isMounted = true;

    async function loadConversations() {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("last_message_at", { ascending: false })
        .limit(100);

      if (!isMounted) {
        return;
      }

      const nextConversations = (data || []) as Conversation[];
      setConversations(nextConversations);
      setLoading(false);
    }

    loadConversations();

    // Real-time: listen for new/updated conversations
    const convChannel = supabase
      .channel(`conversations:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          // Reload conversations list on any change
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(convChannel);
    };
  }, [restaurantId, supabase]);

  // Auto-select first conversation once loaded.
  useEffect(() => {
    if (!selectedId && conversations[0]?.id) {
      setSelectedId(conversations[0].id);
    }
  }, [conversations, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    let isMounted = true;

    async function loadMessages() {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });

      if (!isMounted) {
        return;
      }

      setMessages((data || []) as Message[]);
    }

    loadMessages();

    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [selectedId, supabase]);

  const selectedConversation = conversations.find((item) => item.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <div className="flex w-80 flex-col gap-2 overflow-y-auto">
        <h2 className="mb-2 text-lg font-semibold">المحادثات</h2>
        <Input
          placeholder="ابحث بالاسم أو الهاتف..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-1"
        />
        <div className="mb-2 flex gap-1">
          {(["all", "active", "resolved"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s === "all" ? "الكل" : s === "active" ? "نشطة" : "منتهية"}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="text-sm text-gray-500">جارٍ التحميل...</p>
        ) : null}
        {!loading && filteredConversations.length === 0 ? (
          <p className="text-sm text-gray-500">
            {conversations.length === 0
              ? "لا توجد محادثات بعد. أرسل رسالة واتساب لبدء أول محادثة."
              : "لا توجد محادثات تطابق البحث."}
          </p>
        ) : null}
        {filteredConversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => setSelectedId(conversation.id)}
            className={`rounded-lg border p-3 text-right transition-colors ${
              selectedId === conversation.id
                ? "border-emerald-500 bg-emerald-50"
                : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {conversation.customer_name || conversation.customer_phone}
              </span>
              <Badge
                variant={conversation.status === "active" ? "default" : "secondary"}
                className="text-xs"
              >
                {conversation.status === "active" ? "نشطة" : "منتهية"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {new Date(conversation.last_message_at).toLocaleString()}
            </p>
          </button>
        ))}
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-base">
            {selectedConversation
              ? selectedConversation.customer_name || selectedConversation.customer_phone
              : "اختر محادثة"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && selectedId ? (
            <p className="mt-8 text-center text-sm text-gray-500">
              لا توجد رسائل في هذه المحادثة.
            </p>
          ) : null}
          {messages.map((message) => {
            const isCustomer = message.role === "customer";
            const bubbleColor = isCustomer
              ? "bg-gray-100 text-gray-900"
              : "bg-emerald-600 text-white";
            const chipBase = isCustomer
              ? "bg-white border border-gray-300 text-gray-700"
              : "bg-emerald-700 border border-emerald-500 text-emerald-50";

            // Outbound interactive (list / quick-reply we sent)
            if (message.message_type === "interactive" && message.metadata) {
              const meta = message.metadata as { interactive?: InteractiveReply };
              const interactive = meta.interactive;
              if (interactive && interactive.type !== "text") {
                const isList = interactive.type === "list";
                const entries = isList
                  ? interactive.items.map((i) => ({
                      id: i.id,
                      title: i.title,
                      description: i.description,
                    }))
                  : interactive.options.map((o) => ({
                      id: o.id,
                      title: o.title,
                      description: undefined as string | undefined,
                    }));
                return (
                  <div key={message.id} className="flex justify-end">
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${bubbleColor}`}
                      dir={/[\u0600-\u06FF]/.test(interactive.body) ? "rtl" : "ltr"}
                    >
                      <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                        {isList ? `قائمة · ${interactive.button}` : "أزرار"}
                      </p>
                      <p className="whitespace-pre-wrap">{interactive.body}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {entries.map((e) => (
                          <span
                            key={e.id}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${chipBase}`}
                            title={e.id}
                          >
                            <span>{e.title}</span>
                            <span className="opacity-60">· {e.id}</span>
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-xs opacity-70">
                        {new Date(message.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              }
            }

            // Inbound interactive reply (customer tapped a button / list item)
            if (message.message_type === "interactive_reply" && message.metadata) {
              const meta = message.metadata as {
                tap?: { id: string; title: string | null };
              };
              const tap = meta.tap;
              if (tap) {
                return (
                  <div key={message.id} className="flex justify-start">
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${bubbleColor}`}
                      dir={
                        tap.title && /[\u0600-\u06FF]/.test(tap.title) ? "rtl" : "ltr"
                      }
                    >
                      <p className="italic">
                        تم الاختيار: <span className="not-italic font-medium">{tap.title || tap.id}</span>
                      </p>
                      <span className="mt-1 inline-block rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-mono text-gray-700">
                        {tap.id}
                      </span>
                      <p className="mt-1 text-xs opacity-70">
                        {new Date(message.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              }
            }

            // Plain text (default)
            return (
              <div
                key={message.id}
                className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${bubbleColor}`}
                  dir={/[\u0600-\u06FF]/.test(message.content) ? "rtl" : "ltr"}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p className="mt-1 text-xs opacity-70">
                    {new Date(message.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
