import { MessageSquare, Send, TrendingUp, Clock } from "lucide-react";
import { StatsCard } from "@/components/ui/stats-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const recentConversations = [
    {
      id: 1,
      customer: "Ahmed Hassan",
      message: "What are your opening hours?",
      time: "2 minutes ago",
      status: "replied",
    },
    {
      id: 2,
      customer: "Fatima Ali",
      message: "Can I order for delivery?",
      time: "5 minutes ago",
      status: "replied",
    },
    {
      id: 3,
      customer: "Mohammed Omar",
      message: "Do you have a special menu?",
      time: "12 minutes ago",
      status: "pending",
    },
    {
      id: 4,
      customer: "Sara Mohamed",
      message: "What payment methods do you accept?",
      time: "25 minutes ago",
      status: "replied",
    },
  ];

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          Dashboard Overview
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Welcome back! Here's your restaurant's performance today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Active Conversations"
          value="24"
          icon={<MessageSquare size={24} />}
          trend={{ value: 12, direction: "up" }}
        />
        <StatsCard
          title="Messages Today"
          value="156"
          icon={<Send size={24} />}
          trend={{ value: 8, direction: "up" }}
        />
        <StatsCard
          title="Response Rate"
          value="98%"
          icon={<TrendingUp size={24} />}
          trend={{ value: 2, direction: "up" }}
        />
        <StatsCard
          title="Avg. Response Time"
          value="45s"
          icon={<Clock size={24} />}
          trend={{ value: 5, direction: "down" }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Conversations</CardTitle>
            <CardDescription>Latest customer inquiries and AI responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentConversations.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-start justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900 dark:text-gray-50 truncate">
                        {conv.customer}
                      </h4>
                      <Badge
                        variant={
                          conv.status === "replied" ? "default" : "secondary"
                        }
                      >
                        {conv.status === "replied" ? "✓ Replied" : "Pending"}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {conv.message}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {conv.time}
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
            <CardDescription>Current configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Status
                </span>
                <Badge variant="default">Active</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Personality
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Friendly
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Language
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  English & Arabic
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Knowledge Base
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  45 items
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Questions</CardTitle>
            <CardDescription>Most frequently asked</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { q: "What are your hours?", count: 24 },
                { q: "Do you deliver?", count: 18 },
                { q: "What payment methods?", count: 12 },
                { q: "Special menu items?", count: 8 },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {item.q}
                  </span>
                  <Badge variant="secondary">{item.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Links</CardTitle>
            <CardDescription>Easy access to common tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: "Edit AI Agent Settings", href: "/dashboard/ai-agent" },
                { label: "View All Conversations", href: "/dashboard/conversations" },
                { label: "Manage Knowledge Base", href: "/dashboard/knowledge-base" },
                { label: "Create Marketing Campaign", href: "/dashboard/marketing/campaigns" },
              ].map((link, i) => (
                <a
                  key={i}
                  href={link.href}
                  className="block p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
