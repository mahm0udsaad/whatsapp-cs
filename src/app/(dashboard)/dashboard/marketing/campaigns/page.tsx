"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Send, Plus, CheckCircle, Clock } from "lucide-react";

interface CampaignDraft {
  id: number;
  name: string;
  message: string;
  audienceSize: number;
  createdAt: string;
  status: "draft" | "scheduled" | "sent";
  sentCount?: number;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignDraft[]>([
    {
      id: 1,
      name: "Summer Special 50% Off",
      message:
        "Hi {{customer_name}}, enjoy 50% off on all main courses this weekend! 🌞",
      audienceSize: 250,
      createdAt: "2024-03-15",
      status: "sent",
      sentCount: 245,
    },
    {
      id: 2,
      name: "New Menu Launch",
      message:
        "Check out our new menu items! Order now and get a free dessert! 🎉",
      audienceSize: 250,
      createdAt: "2024-03-10",
      status: "sent",
      sentCount: 250,
    },
    {
      id: 3,
      name: "Easter Special",
      message:
        "Easter celebration with family & friends! Special menu available. Reserve now! 🥚",
      audienceSize: 180,
      createdAt: "2024-03-20",
      status: "draft",
    },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    message: "",
    csvFile: null as File | null,
  });
  const [selectedFile, setSelectedFile] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, csvFile: file });
      setSelectedFile(file.name);
    }
  };

  const handleCreateCampaign = () => {
    if (formData.name && formData.message && formData.csvFile) {
      setCampaigns([
        ...campaigns,
        {
          id: Math.max(0, ...campaigns.map((c) => c.id)) + 1,
          name: formData.name,
          message: formData.message,
          audienceSize: Math.floor(Math.random() * 200) + 50,
          createdAt: new Date().toISOString().split("T")[0],
          status: "draft",
        },
      ]);

      setFormData({
        name: "",
        message: "",
        csvFile: null,
      });
      setSelectedFile("");
      setShowForm(false);
    }
  };

  const handleSendCampaign = (id: number) => {
    setCampaigns(
      campaigns.map((c) =>
        c.id === id
          ? {
              ...c,
              status: "sent" as const,
              sentCount: c.audienceSize - Math.floor(Math.random() * 20),
            }
          : c
      )
    );
  };

  const handleScheduleCampaign = (id: number) => {
    setCampaigns(
      campaigns.map((c) =>
        c.id === id ? { ...c, status: "scheduled" as const } : c
      )
    );
  };

  const draftCount = campaigns.filter((c) => c.status === "draft").length;
  const scheduledCount = campaigns.filter((c) => c.status === "scheduled")
    .length;
  const sentCount = campaigns.filter((c) => c.status === "sent").length;

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
            Campaign Manager
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Create, send, and manage WhatsApp marketing campaigns
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus size={18} />
          New Campaign
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-blue-900 dark:text-blue-200">
              {draftCount}
            </div>
            <p className="text-sm text-blue-800 dark:text-blue-300">Drafts</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-800">
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-orange-900 dark:text-orange-200">
              {scheduledCount}
            </div>
            <p className="text-sm text-orange-800 dark:text-orange-300">
              Scheduled
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-green-900 dark:text-green-200">
              {sentCount}
            </div>
            <p className="text-sm text-green-800 dark:text-green-300">Sent</p>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Campaign</CardTitle>
            <CardDescription>
              Design and launch a WhatsApp marketing campaign
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Campaign Name
              </label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Easter Special"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Message
              </label>
              <Textarea
                value={formData.message}
                onChange={(e) =>
                  setFormData({ ...formData, message: e.target.value })
                }
                placeholder="Type your message. Use {{customer_name}} for personalization."
                rows={5}
              />
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {formData.message.length} characters. WhatsApp limit is 4096.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Upload Customer List (CSV)
              </label>
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-emerald-500 dark:hover:border-emerald-400 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-input"
                />
                <label htmlFor="file-input" className="cursor-pointer block">
                  <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
                    {selectedFile || "Click to upload or drag and drop"}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    CSV or XLSX file with phone numbers
                  </p>
                </label>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-900 dark:text-blue-200 font-medium mb-2">
                📋 CSV Format
              </p>
              <p className="text-xs text-blue-800 dark:text-blue-300">
                phone, name, email (headers required)
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCreateCampaign}
                disabled={!formData.name || !formData.message || !formData.csvFile}
              >
                Create Draft
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">All ({campaigns.length})</TabsTrigger>
          <TabsTrigger value="draft">Draft ({draftCount})</TabsTrigger>
          <TabsTrigger value="sent">Sent ({sentCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3 mt-4">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onSend={() => handleSendCampaign(campaign.id)}
              onSchedule={() => handleScheduleCampaign(campaign.id)}
            />
          ))}
        </TabsContent>

        <TabsContent value="draft" className="space-y-3 mt-4">
          {campaigns
            .filter((c) => c.status === "draft")
            .map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onSend={() => handleSendCampaign(campaign.id)}
                onSchedule={() => handleScheduleCampaign(campaign.id)}
              />
            ))}
        </TabsContent>

        <TabsContent value="sent" className="space-y-3 mt-4">
          {campaigns
            .filter((c) => c.status === "sent")
            .map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onSend={() => handleSendCampaign(campaign.id)}
                onSchedule={() => handleScheduleCampaign(campaign.id)}
              />
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface CampaignCardProps {
  campaign: CampaignDraft;
  onSend: () => void;
  onSchedule: () => void;
}

function CampaignCard({ campaign, onSend, onSchedule }: CampaignCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-gray-50">
              {campaign.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={
                  campaign.status === "sent"
                    ? "default"
                    : campaign.status === "scheduled"
                    ? "secondary"
                    : "outline"
                }
              >
                {campaign.status === "sent" && (
                  <>
                    <CheckCircle size={12} className="mr-1" />
                    Sent
                  </>
                )}
                {campaign.status === "scheduled" && (
                  <>
                    <Clock size={12} className="mr-1" />
                    Scheduled
                  </>
                )}
                {campaign.status === "draft" && "Draft"}
              </Badge>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {campaign.audienceSize} contacts
              </span>
            </div>
          </div>
          {campaign.status === "sent" && campaign.sentCount && (
            <div className="text-right">
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {campaign.sentCount} sent
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {Math.round((campaign.sentCount / campaign.audienceSize) * 100)}%
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {campaign.message}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Created {campaign.createdAt}
          </p>
          <div className="flex gap-2">
            {campaign.status === "draft" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSchedule}
                  className="gap-1"
                >
                  <Clock size={14} />
                  Schedule
                </Button>
                <Button size="sm" onClick={onSend} className="gap-1">
                  <Send size={14} />
                  Send Now
                </Button>
              </>
            )}
            {campaign.status === "sent" && (
              <Button variant="outline" size="sm">
                View Analytics
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
