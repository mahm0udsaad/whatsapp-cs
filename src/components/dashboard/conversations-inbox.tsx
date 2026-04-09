"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Conversation, Message } from "@/lib/types";

interface ConversationsInboxProps {
  restaurantId: string;
  initialConversations: Conversation[];
}

export function ConversationsInbox({
  restaurantId,
  initialConversations,
}: ConversationsInboxProps) {
  const supabase = createClient();
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
      if (!selectedId && nextConversations[0]?.id) {
        setSelectedId(nextConversations[0].id);
      }
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
  }, [restaurantId, selectedId, supabase]);

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
        <h2 className="mb-2 text-lg font-semibold">Conversations</h2>
        <Input
          placeholder="Search by name or phone..."
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
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : null}
        {!loading && filteredConversations.length === 0 ? (
          <p className="text-sm text-gray-500">
            {conversations.length === 0
              ? "No conversations yet. Send a WhatsApp message to start the first thread."
              : "No conversations match your search."}
          </p>
        ) : null}
        {filteredConversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => setSelectedId(conversation.id)}
            className={`rounded-lg border p-3 text-left transition-colors ${
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
                {conversation.status}
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
              : "Select a conversation"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && selectedId ? (
            <p className="mt-8 text-center text-sm text-gray-500">
              No messages in this conversation.
            </p>
          ) : null}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "customer" ? "justify-start" : "justify-end"
              }`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${
                  message.role === "customer"
                    ? "bg-gray-100 text-gray-900"
                    : "bg-emerald-600 text-white"
                }`}
                dir={/[\u0600-\u06FF]/.test(message.content) ? "rtl" : "ltr"}
              >
                <p>{message.content}</p>
                <p className="mt-1 text-xs opacity-70">
                  {new Date(message.created_at).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
