"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Search } from "lucide-react";

interface Message {
  id: number;
  type: "customer" | "agent";
  content: string;
  timestamp: string;
}

interface Conversation {
  id: number;
  customer: string;
  phone: string;
  messages: Message[];
  status: "active" | "resolved" | "pending";
  lastMessage: string;
  lastMessageTime: string;
}

export default function ConversationsPage() {
  const [selectedConversation, setSelectedConversation] = useState<number | null>(
    1
  );
  const [searchTerm, setSearchTerm] = useState("");

  const conversations: Conversation[] = [
    {
      id: 1,
      customer: "Ahmed Hassan",
      phone: "+201001234567",
      status: "active",
      lastMessage: "Can I get delivery to my address?",
      lastMessageTime: "2 minutes ago",
      messages: [
        {
          id: 1,
          type: "customer",
          content: "Hello, what are your opening hours?",
          timestamp: "10:15 AM",
        },
        {
          id: 2,
          type: "agent",
          content:
            "We're open Monday-Thursday from 11 AM to 11 PM, Friday-Saturday 11 AM to 1 AM, and Sunday 12 PM to 10 PM!",
          timestamp: "10:15 AM",
        },
        {
          id: 3,
          type: "customer",
          content: "Great! Can I order now?",
          timestamp: "10:16 AM",
        },
        {
          id: 4,
          type: "agent",
          content:
            "Of course! You can order through WhatsApp and we'll deliver to your location.",
          timestamp: "10:16 AM",
        },
        {
          id: 5,
          type: "customer",
          content: "Can I get delivery to my address?",
          timestamp: "10:17 AM",
        },
      ],
    },
    {
      id: 2,
      customer: "Fatima Ali",
      phone: "+201234567890",
      status: "resolved",
      lastMessage: "Thank you! My order is confirmed.",
      lastMessageTime: "1 hour ago",
      messages: [
        {
          id: 1,
          type: "customer",
          content: "Do you have a vegetarian menu?",
          timestamp: "9:30 AM",
        },
        {
          id: 2,
          type: "agent",
          content:
            "Yes! We have several vegetarian options including salads, pasta, and vegetable dishes.",
          timestamp: "9:30 AM",
        },
        {
          id: 3,
          type: "customer",
          content: "What's the best vegetarian option?",
          timestamp: "9:31 AM",
        },
        {
          id: 4,
          type: "agent",
          content:
            "I'd recommend our Caesar Salad or Mushroom Pasta. Both are very popular!",
          timestamp: "9:32 AM",
        },
      ],
    },
    {
      id: 3,
      customer: "Mohammed Omar",
      phone: "+201567890123",
      status: "pending",
      lastMessage: "What payment methods do you accept?",
      lastMessageTime: "15 minutes ago",
      messages: [
        {
          id: 1,
          type: "customer",
          content: "What payment methods do you accept?",
          timestamp: "10:02 AM",
        },
      ],
    },
    {
      id: 4,
      customer: "Sara Mohamed",
      phone: "+201890123456",
      status: "active",
      lastMessage: "Can you tell me about the specials?",
      lastMessageTime: "5 minutes ago",
      messages: [
        {
          id: 1,
          type: "customer",
          content: "Do you have any discounts?",
          timestamp: "10:12 AM",
        },
        {
          id: 2,
          type: "agent",
          content:
            "Yes! We have 20% off orders above 200 EGP and free delivery above 150 EGP.",
          timestamp: "10:12 AM",
        },
        {
          id: 3,
          type: "customer",
          content: "Can you tell me about the specials?",
          timestamp: "10:17 AM",
        },
      ],
    },
  ];

  const selectedData = conversations.find((c) => c.id === selectedConversation);
  const filteredConversations = conversations.filter((c) =>
    c.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          Conversations
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Monitor and manage customer conversations
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
        <div>
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Conversations</CardTitle>
              <CardDescription>
                {conversations.length} total conversations
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-2">
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder="Search by name or phone"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors border-2 ${
                    selectedConversation === conv.id
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                      : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <div className="flex items-start gap-2 mb-1">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-gray-50 text-sm">
                        {conv.customer}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        {conv.phone}
                      </p>
                    </div>
                    <Badge
                      variant={
                        conv.status === "active"
                          ? "default"
                          : conv.status === "resolved"
                          ? "secondary"
                          : "outline"
                      }
                      className="text-xs"
                    >
                      {conv.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                    {conv.lastMessage}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {conv.lastMessageTime}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {selectedData ? (
            <Card className="h-full flex flex-col">
              <CardHeader className="border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{selectedData.customer}</CardTitle>
                    <CardDescription>{selectedData.phone}</CardDescription>
                  </div>
                  <Badge
                    variant={
                      selectedData.status === "active"
                        ? "default"
                        : selectedData.status === "resolved"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {selectedData.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedData.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.type === "customer" ? "justify-start" : "justify-end"
                    }`}
                  >
                    <div
                      className={`max-w-xs rounded-lg p-3 ${
                        message.type === "customer"
                          ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-50"
                          : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-200"
                      }`}
                    >
                      <p className="text-sm mb-1">{message.content}</p>
                      <p className="text-xs opacity-70">{message.timestamp}</p>
                    </div>
                  </div>
                ))}
              </CardContent>

              <div className="border-t border-gray-200 dark:border-gray-800 p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    className="flex-1"
                  />
                  <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium">
                    Send
                  </button>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center">
                <MessageCircle
                  size={40}
                  className="mx-auto text-gray-400 dark:text-gray-600 mb-3"
                />
                <p className="text-gray-600 dark:text-gray-400">
                  Select a conversation to view details
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
