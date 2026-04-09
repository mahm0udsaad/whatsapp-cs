"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  AITemplateBuilderMessage,
  AITemplateCollectedData,
  AITemplateBuilderResponse,
} from "@/lib/types";

interface TemplateBuilderChatProps {
  restaurantName: string;
  onTemplateUpdate: (response: AITemplateBuilderResponse) => void;
  onStatusChange: (status: "collecting" | "generating" | "complete") => void;
  className?: string;
}

export function TemplateBuilderChat({
  restaurantName,
  onTemplateUpdate,
  onStatusChange,
  className,
}: TemplateBuilderChatProps) {
  const [messages, setMessages] = useState<AITemplateBuilderMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([
    {
      role: "assistant",
      content: `Welcome! I'll help you create a WhatsApp marketing template for ${restaurantName}. What kind of campaign are you planning? For example: a promotion, new product launch, event invitation, or seasonal offer.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [collectedData, setCollectedData] = useState<AITemplateCollectedData>(
    {}
  );
  const [status, setStatus] = useState<
    "collecting" | "generating" | "complete"
  >("collecting");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [displayMessages, scrollToBottom]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: AITemplateBuilderMessage = {
      role: "user",
      content: trimmed,
    };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setDisplayMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/marketing/ai-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          collectedData,
          restaurantName,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to get AI response");
      }

      const data: AITemplateBuilderResponse = await res.json();

      setCollectedData(data.collectedData);
      setStatus(data.status);
      onStatusChange(data.status);
      onTemplateUpdate(data);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);
      setDisplayMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);
    } catch {
      setDisplayMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Chat header */}
      <div className="flex items-center gap-3 border-b border-slate-200/70 px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700">
          <Bot size={20} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-950">
            AI Template Builder
          </h3>
          <p className="text-xs text-slate-500">
            {status === "collecting"
              ? "Gathering your requirements..."
              : status === "generating"
              ? "Generating your template..."
              : "Template ready!"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {displayMessages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3",
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                msg.role === "user"
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-100 text-slate-600"
              )}
            >
              {msg.role === "user" ? (
                <User size={14} />
              ) : (
                <Bot size={14} />
              )}
            </div>
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6",
                msg.role === "user"
                  ? "rounded-tr-sm bg-emerald-600 text-white"
                  : "rounded-tl-sm bg-slate-100 text-slate-800"
              )}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Bot size={14} />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" />
                Thinking...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200/70 p-4">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              status === "complete"
                ? "Template is ready! Save it above."
                : "Describe your campaign..."
            }
            disabled={isLoading || status === "complete"}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || status === "complete"}
            className="h-11 w-11 shrink-0 rounded-xl p-0"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
