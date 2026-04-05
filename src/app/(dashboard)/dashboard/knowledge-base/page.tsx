"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Trash2, Edit2 } from "lucide-react";

interface KnowledgeEntry {
  id: number;
  title: string;
  content: string;
  category: string;
  createdAt: string;
}

export default function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState("entries");
  const [entries, setEntries] = useState<KnowledgeEntry[]>([
    {
      id: 1,
      title: "Delivery Policy",
      content:
        "We deliver to all areas within 5km radius. Minimum order: 50 EGP. Free delivery on orders above 150 EGP.",
      category: "Policies",
      createdAt: "2024-03-20",
    },
    {
      id: 2,
      title: "Special Diets",
      content:
        "We offer vegetarian, vegan, gluten-free, and low-carb options. Please mention dietary requirements when ordering.",
      category: "Menu",
      createdAt: "2024-03-19",
    },
    {
      id: 3,
      title: "Operating Hours",
      content: "Monday-Thursday: 11 AM - 11 PM, Friday-Saturday: 11 AM - 1 AM, Sunday: 12 PM - 10 PM",
      category: "General",
      createdAt: "2024-03-18",
    },
    {
      id: 4,
      title: "Payment Methods",
      content:
        "We accept cash, credit cards, debit cards, and digital wallets (Apple Pay, Google Pay).",
      category: "Policies",
      createdAt: "2024-03-17",
    },
  ]);

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "General",
  });

  const [editingId, setEditingId] = useState<number | null>(null);

  const handleAddEntry = () => {
    if (formData.title && formData.content) {
      if (editingId) {
        setEntries(
          entries.map((e) =>
            e.id === editingId
              ? { ...e, ...formData, createdAt: e.createdAt }
              : e
          )
        );
        setEditingId(null);
      } else {
        setEntries([
          ...entries,
          {
            id: Math.max(0, ...entries.map((e) => e.id)) + 1,
            ...formData,
            createdAt: new Date().toISOString().split("T")[0],
          },
        ]);
      }
      setFormData({ title: "", content: "", category: "General" });
    }
  };

  const handleEdit = (entry: KnowledgeEntry) => {
    setFormData({
      title: entry.title,
      content: entry.content,
      category: entry.category,
    });
    setEditingId(entry.id);
  };

  const handleDelete = (id: number) => {
    setEntries(entries.filter((e) => e.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setFormData({ title: "", content: "", category: "General" });
    }
  };

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          Knowledge Base
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Build a comprehensive knowledge base for your AI agent
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge Entries</CardTitle>
              <CardDescription>
                {entries.length} entries in your knowledge base
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {entries.length === 0 ? (
                <div className="text-center py-8">
                  <FileText size={40} className="mx-auto text-gray-400 dark:text-gray-600 mb-3" />
                  <p className="text-gray-600 dark:text-gray-400">
                    No entries yet. Create your first knowledge base entry!
                  </p>
                </div>
              ) : (
                entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-50">
                          {entry.title}
                        </h3>
                        <Badge variant="secondary" className="mt-1">
                          {entry.category}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <button
                          onClick={() => handleEdit(entry)}
                          className="p-2 text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {entry.content}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      Added {entry.createdAt}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus size={20} />
                {editingId ? "Edit Entry" : "Add Entry"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Title
                </label>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="e.g., Delivery Policy"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Content
                </label>
                <Textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  placeholder="Write the knowledge entry..."
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50"
                >
                  <option value="General">General</option>
                  <option value="Menu">Menu</option>
                  <option value="Policies">Policies</option>
                  <option value="Hours">Hours</option>
                  <option value="Payments">Payments</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleAddEntry}
                  disabled={!formData.title || !formData.content}
                >
                  {editingId ? "Update Entry" : "Add Entry"}
                </Button>
                {editingId && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setEditingId(null);
                      setFormData({ title: "", content: "", category: "General" });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
                <p className="text-blue-900 dark:text-blue-200 font-medium mb-2">
                  💡 Pro Tip
                </p>
                <p className="text-blue-800 dark:text-blue-300 text-xs">
                  Clear and concise entries help your AI agent provide accurate answers. Include prices, policies, and special offers.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
          <CardDescription>Knowledge base overview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {entries.length}
              </div>
              <div className="text-sm text-emerald-700 dark:text-emerald-300">
                Total Entries
              </div>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {new Set(entries.map((e) => e.category)).size}
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300">
                Categories
              </div>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {Math.round(
                  entries.reduce((acc, e) => acc + e.content.length, 0) / 100
                )}
              </div>
              <div className="text-sm text-purple-700 dark:text-purple-300">
                Tokens Used
              </div>
            </div>
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {entries.filter((e) => e.category === "Policies").length}
              </div>
              <div className="text-sm text-orange-700 dark:text-orange-300">
                Policies
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
