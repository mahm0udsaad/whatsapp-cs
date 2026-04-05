"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Conversation {
  id: string;
  customer_phone: string;
  status: string;
  last_message_at: string;
  started_at: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export default function ConversationsPage() {
  const supabase = createClient();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false })
        .limit(50);
      setConversations(data || []);
      if (data && data.length > 0) setSelectedId(data[0].id);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    async function loadMessages() {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });
      setMessages(data || []);
    }
    loadMessages();

    // Realtime subscription for live updates
    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${selectedId}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedId]);

  const selectedConv = conversations.find((c) => c.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-6">
      {/* Conversation list */}
      <div className="w-80 flex flex-col gap-2 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-2">Conversations</h2>
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!loading && conversations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No conversations yet. Send a WhatsApp message to get started!
          </p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => setSelectedId(conv.id)}
            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
              selectedId === conv.id
                ? "bg-primary/10 border-primary"
                : "hover:bg-muted"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{conv.customer_phone}</span>
              <Badge
                variant={conv.status === "active" ? "default" : "secondary"}
                className="text-xs"
              >
                {conv.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {conv.last_message_at
                ? new Date(conv.last_message_at).toLocaleString()
                : "—"}
            </p>
          </div>
        ))}
      </div>

      {/* Message thread */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-base">
            {selectedConv ? selectedConv.customer_phone : "Select a conversation"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && selectedId && (
            <p className="text-sm text-muted-foreground text-center mt-8">
              No messages in this conversation
            </p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "customer" ? "justify-start" : "justify-end"
              }`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 text-sm ${
                  msg.role === "customer"
                    ? "bg-muted text-foreground"
                    : "bg-primary text-primary-foreground"
                }`}
                dir={/[\u0600-\u06FF]/.test(msg.content) ? "rtl" : "ltr"}
              >
                <p>{msg.content}</p>
                <p className="text-xs mt-1 opacity-70">
                  {new Date(msg.created_at).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
