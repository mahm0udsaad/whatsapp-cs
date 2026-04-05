"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, TrendingUp, Users, Send } from "lucide-react";
import Link from "next/link";

interface Campaign {
  id: number;
  name: string;
  type: "promotion" | "announcement" | "survey";
  audience: number;
  sent: number;
  replies: number;
  createdAt: string;
  status: "active" | "paused" | "completed";
}

export default function MarketingPage() {
  const campaigns: Campaign[] = [
    {
      id: 1,
      name: "Summer Special 50% Off",
      type: "promotion",
      audience: 250,
      sent: 245,
      replies: 89,
      createdAt: "2024-03-15",
      status: "active",
    },
    {
      id: 2,
      name: "New Menu Launch",
      type: "announcement",
      audience: 250,
      sent: 250,
      replies: 156,
      createdAt: "2024-03-10",
      status: "completed",
    },
    {
      id: 3,
      name: "Feedback Survey",
      type: "survey",
      audience: 200,
      sent: 198,
      replies: 92,
      createdAt: "2024-03-05",
      status: "paused",
    },
  ];

  const totalStats = {
    activeCustomers: 324,
    totalSent: 693,
    totalReplies: 337,
    averageResponseRate: Math.round((337 / 693) * 100),
  };

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
            Marketing Campaigns
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Create and manage WhatsApp marketing campaigns
          </p>
        </div>
        <Link href="/dashboard/marketing/campaigns">
          <Button className="gap-2">
            <Plus size={18} />
            New Campaign
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-6">
            <Users size={24} className="text-blue-600 dark:text-blue-400 mb-3" />
            <div className="text-3xl font-bold text-blue-900 dark:text-blue-200">
              {totalStats.activeCustomers}
            </div>
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Active Customers
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
          <CardContent className="p-6">
            <Send size={24} className="text-green-600 dark:text-green-400 mb-3" />
            <div className="text-3xl font-bold text-green-900 dark:text-green-200">
              {totalStats.totalSent}
            </div>
            <p className="text-sm text-green-800 dark:text-green-300">
              Messages Sent
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-6">
            <TrendingUp size={24} className="text-purple-600 dark:text-purple-400 mb-3" />
            <div className="text-3xl font-bold text-purple-900 dark:text-purple-200">
              {totalStats.totalReplies}
            </div>
            <p className="text-sm text-purple-800 dark:text-purple-300">
              Replies Received
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-800">
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-orange-900 dark:text-orange-200">
              {totalStats.averageResponseRate}%
            </div>
            <p className="text-sm text-orange-800 dark:text-orange-300">
              Response Rate
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Campaigns</CardTitle>
          <CardDescription>Your latest marketing campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-50">
                      {campaign.name}
                    </h4>
                    <Badge
                      variant={
                        campaign.type === "promotion"
                          ? "default"
                          : campaign.type === "announcement"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {campaign.type}
                    </Badge>
                    <Badge
                      variant={
                        campaign.status === "active"
                          ? "default"
                          : campaign.status === "completed"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {campaign.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span>Audience: {campaign.audience}</span>
                    <span>Sent: {campaign.sent}</span>
                    <span>Replies: {campaign.replies}</span>
                    <span className="text-xs">
                      {Math.round((campaign.replies / campaign.sent) * 100)}%
                      response rate
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                    Created {campaign.createdAt}
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  View Details
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Campaign Templates</CardTitle>
            <CardDescription>Ready-to-use templates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Holiday Special", desc: "Promote special holiday offers" },
              { label: "New Item Launch", desc: "Announce new menu items" },
              { label: "Customer Feedback", desc: "Request customer reviews" },
              { label: "Event Invitation", desc: "Invite customers to events" },
            ].map((template, i) => (
              <button
                key={i}
                className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
              >
                <div className="font-medium text-gray-900 dark:text-gray-50 text-sm">
                  {template.label}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {template.desc}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <CardDescription>Common marketing tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/dashboard/marketing/templates" className="block">
              <Button variant="outline" className="w-full justify-start">
                Create WhatsApp Template
              </Button>
            </Link>
            <Link href="/dashboard/marketing/campaigns" className="block">
              <Button variant="outline" className="w-full justify-start">
                Import Customer List (XLSX)
              </Button>
            </Link>
            <Button variant="outline" className="w-full justify-start">
              View Campaign Analytics
            </Button>
            <Button variant="outline" className="w-full justify-start">
              Export Customer Segments
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
