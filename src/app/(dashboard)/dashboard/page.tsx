import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, MessageSquare, Send, TrendingUp } from "lucide-react";
import { StatsCard } from "@/components/ui/stats-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  getActiveAgentForRestaurant,
  getCurrentUser,
  getRestaurantForUserId,
} from "@/lib/tenant";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const restaurant = await getRestaurantForUserId(user.id);

  if (!restaurant) {
    redirect("/onboarding");
  }

  const aiAgent = await getActiveAgentForRestaurant(restaurant.id);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    conversationsResult,
    activeConversationsResult,
    restaurantConversationIdsResult,
    knowledgeBaseResult,
    recentConversationsResult,
  ] = await Promise.all([
    adminSupabaseClient
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id),
    adminSupabaseClient
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id)
      .eq("status", "active"),
    adminSupabaseClient
      .from("conversations")
      .select("id")
      .eq("restaurant_id", restaurant.id),
    adminSupabaseClient
      .from("knowledge_base")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id),
    adminSupabaseClient
      .from("conversations")
      .select("id, customer_name, customer_phone, status, last_message_at")
      .eq("restaurant_id", restaurant.id)
      .order("last_message_at", { ascending: false })
      .limit(5),
  ]);

  const recentConversations = recentConversationsResult.data || [];
  const restaurantConversationIds = (
    restaurantConversationIdsResult.data || []
  ).map((item) => item.id);
  const { data: allTodayMessagesData } = restaurantConversationIds.length
    ? await adminSupabaseClient
        .from("messages")
        .select("id, conversation_id, role, content, created_at")
        .in("conversation_id", restaurantConversationIds)
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] as Array<{
        id: string;
        conversation_id: string;
        role: string;
        content: string;
        created_at: string;
      }> };
  const allTodayMessages = allTodayMessagesData || [];
  const conversationIds = new Set(recentConversations.map((item) => item.id));
  const todayMessages = allTodayMessages.filter((item) =>
    conversationIds.size === 0 ? true : conversationIds.has(item.conversation_id)
  );

  const latestMessageByConversation = new Map<string, string>();
  for (const message of todayMessages) {
    if (!latestMessageByConversation.has(message.conversation_id)) {
      latestMessageByConversation.set(message.conversation_id, message.content);
    }
  }

  const totalConversations = conversationsResult.count || 0;
  const activeConversations = activeConversationsResult.count || 0;
  const messagesToday = allTodayMessages.length;
  const totalAIMessages = allTodayMessages.filter(
    (item) => item.role === "agent"
  ).length;
  const responseRate =
    totalConversations > 0
      ? Math.round((Math.min(totalAIMessages, totalConversations) / totalConversations) * 100)
      : 0;
  const knowledgeBaseItems = knowledgeBaseResult.count || 0;

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          Dashboard Overview
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Operational view for {restaurant.name}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Conversations"
          value={activeConversations}
          icon={<MessageSquare size={24} />}
        />
        <StatsCard
          title="Messages Today"
          value={messagesToday}
          icon={<Send size={24} />}
        />
        <StatsCard
          title="Response Rate"
          value={`${responseRate}%`}
          icon={<TrendingUp size={24} />}
        />
        <StatsCard
          title="Knowledge Base"
          value={knowledgeBaseItems}
          icon={<Clock size={24} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Conversations</CardTitle>
            <CardDescription>
              Latest customer threads for this tenant
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentConversations.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No conversations yet.
                </p>
              ) : null}
              {recentConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="flex items-start justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h4 className="truncate font-medium text-gray-900 dark:text-gray-50">
                        {conversation.customer_name || conversation.customer_phone}
                      </h4>
                      <Badge
                        variant={
                          conversation.status === "active" ? "default" : "secondary"
                        }
                      >
                        {conversation.status}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-gray-600 dark:text-gray-400">
                      {latestMessageByConversation.get(conversation.id) ||
                        "No message preview available"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                      {new Date(conversation.last_message_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Agent Status</CardTitle>
            <CardDescription>Current tenant configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Setup Status
                </span>
                <Badge variant="default">{restaurant.setup_status || "draft"}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Agent
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  {aiAgent?.name || "Not configured"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Personality
                </span>
                <span className="text-sm font-medium capitalize text-gray-900 dark:text-gray-50">
                  {aiAgent?.personality || "n/a"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Language
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  {aiAgent?.language_preference || "n/a"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  WhatsApp Number
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  {restaurant.twilio_phone_number || "Pending"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Links</CardTitle>
            <CardDescription>Common operational tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: "Edit AI Agent Settings", href: "/dashboard/ai-agent" },
                { label: "View Conversations", href: "/dashboard/conversations" },
                { label: "Manage Restaurant Profile", href: "/dashboard/restaurant" },
                { label: "Manage Knowledge Base", href: "/dashboard/knowledge-base" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-700 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tenant Readiness</CardTitle>
            <CardDescription>
              What still needs to be completed for a stronger live bot
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Knowledge base seeded
              </span>
              <Badge variant={knowledgeBaseItems > 0 ? "default" : "secondary"}>
                {knowledgeBaseItems > 0 ? "Ready" : "Needs content"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                WhatsApp sender assigned
              </span>
              <Badge variant={restaurant.twilio_phone_number ? "default" : "secondary"}>
                {restaurant.twilio_phone_number ? "Assigned" : "Pending"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                AI agent configured
              </span>
              <Badge variant={aiAgent ? "default" : "secondary"}>
                {aiAgent ? "Ready" : "Pending"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
