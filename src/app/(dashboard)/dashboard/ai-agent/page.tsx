"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Settings, Eye } from "lucide-react";

export default function AIAgentPage() {
  const [isSaving, setIsSaving] = useState(false);
  const [personality, setPersonality] = useState("friendly");
  const [formData, setFormData] = useState({
    agentName: "Chef's Assistant",
    systemInstructions: `You are a helpful restaurant assistant. You answer questions about our menu, hours, delivery options, and reservations. Always be polite, friendly, and try to help. If you don't know something, suggest contacting the restaurant directly.`,
    language: "en",
    temperature: "0.7",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
  };

  const personalities = [
    {
      value: "friendly",
      label: "😊 Friendly",
      desc: "Warm, welcoming, and conversational",
      sample: "Hey there! 👋 Happy to help!",
    },
    {
      value: "professional",
      label: "💼 Professional",
      desc: "Formal, precise, and business-like",
      sample: "Good day. How may I assist you?",
    },
    {
      value: "creative",
      label: "✨ Creative",
      desc: "Fun, engaging, and entertaining",
      sample: "Let's cook up some solutions! 🍳",
    },
    {
      value: "strict",
      label: "🎯 Strict",
      desc: "Direct, efficient, and to the point",
      sample: "State your question. I'll help.",
    },
  ];

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          AI Agent Configuration
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Customize your restaurant's AI assistant behavior and responses
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agent Details</CardTitle>
              <CardDescription>Basic configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Agent Name
                </label>
                <Input
                  name="agentName"
                  value={formData.agentName}
                  onChange={handleChange}
                  placeholder="e.g., Chef's Assistant"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Personality Style
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {personalities.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setPersonality(p.value)}
                      className={`p-4 rounded-lg border-2 transition-all text-left ${
                        personality === p.value
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <div className="font-medium text-sm">{p.label}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {p.desc}
                      </div>
                      <div className="text-xs italic text-gray-500 dark:text-gray-500 mt-2">
                        "{p.sample}"
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Instructions</CardTitle>
              <CardDescription>
                Define how your AI agent should behave
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                name="systemInstructions"
                value={formData.systemInstructions}
                onChange={handleChange}
                placeholder="Enter system instructions..."
                rows={8}
              />
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
                <p className="text-blue-900 dark:text-blue-200 font-medium mb-2">
                  💡 Tips for better responses:
                </p>
                <ul className="text-blue-800 dark:text-blue-300 space-y-1 text-xs">
                  <li>• Be specific about the restaurant's services</li>
                  <li>• Include contact info for complex requests</li>
                  <li>• Set expectations for response times</li>
                  <li>• Define when to escalate to humans</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
              <CardDescription>Fine-tune AI behavior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Temperature
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      name="temperature"
                      min="0"
                      max="1"
                      step="0.1"
                      value={formData.temperature}
                      onChange={handleChange}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50 min-w-fit">
                      {formData.temperature}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Lower = more consistent, Higher = more creative
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Response Language
                  </label>
                  <select
                    value={formData.language}
                    onChange={(e) =>
                      setFormData({ ...formData, language: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50"
                  >
                    <option value="en">English</option>
                    <option value="ar">العربية (Arabic)</option>
                    <option value="both">Both (Smart)</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye size={20} />
                Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                    {formData.agentName}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-white dark:bg-gray-800 p-2 rounded">
                    <p className="font-medium mb-1">Sample conversation:</p>
                    <p className="text-emerald-900 dark:text-emerald-100">
                      Customer: What are your hours?
                    </p>
                  </div>
                  <div className="text-xs bg-emerald-100 dark:bg-emerald-900/40 p-2 rounded ml-6 border-l-2 border-emerald-600">
                    <p className="text-emerald-900 dark:text-emerald-200">
                      {personality === "friendly"
                        ? "We're open 9 AM to 11 PM every day! 😊"
                        : personality === "professional"
                        ? "Our operating hours are 09:00 to 23:00 daily."
                        : personality === "creative"
                        ? "Chef's here 24/7... but we officially serve 9 AM - 11 PM! 🍽️"
                        : "9 AM - 11 PM daily."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                  Configuration Summary
                </h4>
                <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="font-medium">Name:</span> {formData.agentName}
                  </div>
                  <div>
                    <span className="font-medium">Personality:</span>
                    <Badge variant="default" className="ml-1">
                      {personality}
                    </Badge>
                  </div>
                  <div>
                    <span className="font-medium">Language:</span>{" "}
                    {formData.language === "both"
                      ? "Auto-detect"
                      : formData.language}
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Configuration"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings size={20} />
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Agent Status</span>
                <Badge variant="default">Active</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Last Updated
                </span>
                <span className="font-medium text-gray-900 dark:text-gray-50">
                  2 hours ago
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  Total Conversations
                </span>
                <span className="font-medium text-gray-900 dark:text-gray-50">
                  342
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
