"use client";

import { useState } from "react";
import { Edit2, FileText, Globe, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KnowledgeBase } from "@/lib/types";

interface KnowledgeBaseManagerProps {
  initialEntries: KnowledgeBase[];
  websiteUrl?: string | null;
}

export function KnowledgeBaseManager({
  initialEntries,
  websiteUrl,
}: KnowledgeBaseManagerProps) {
  const [entries, setEntries] = useState<KnowledgeBase[]>(initialEntries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    sourceType: "manual",
  });

  // Crawl state
  const [crawlUrl, setCrawlUrl] = useState(websiteUrl || "");
  const [crawling, setCrawling] = useState(false);
  const [crawlResult, setCrawlResult] = useState<{
    entries_created: number;
    pages_crawled: number;
  } | null>(null);
  const [crawlError, setCrawlError] = useState("");

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      title: "",
      content: "",
      sourceType: "manual",
    });
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError("");

    const url = editingId
      ? `/api/dashboard/knowledge-base/${editingId}`
      : "/api/dashboard/knowledge-base";
    const method = editingId ? "PATCH" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          source_type: formData.sourceType,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to save entry.");
        return;
      }

      if (editingId) {
        setEntries((prev) =>
          prev.map((entry) => (entry.id === editingId ? result.entry : entry))
        );
      } else {
        setEntries((prev) => [result.entry, ...prev]);
      }

      resetForm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to save entry."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError("");

    try {
      const response = await fetch(`/api/dashboard/knowledge-base/${id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to delete entry.");
        return;
      }

      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete entry."
      );
    }
  };

  const handleEdit = (entry: KnowledgeBase) => {
    setEditingId(entry.id);
    setFormData({
      title: entry.title || "",
      content: entry.content,
      sourceType: entry.source_type || "manual",
    });
  };

  const handleCrawl = async () => {
    if (!crawlUrl.trim()) return;
    setCrawling(true);
    setCrawlError("");
    setCrawlResult(null);

    try {
      const response = await fetch("/api/dashboard/knowledge-base/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: crawlUrl.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        setCrawlError(result.error || "Crawl failed.");
        return;
      }

      setEntries((prev) => [...(result.entries as KnowledgeBase[]), ...prev]);
      setCrawlResult({
        entries_created: result.entries_created,
        pages_crawled: result.pages_crawled,
      });
    } catch (crawlErr) {
      setCrawlError(
        crawlErr instanceof Error ? crawlErr.message : "Crawl failed."
      );
    } finally {
      setCrawling(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge Entries</CardTitle>
              <CardDescription>
                {entries.length} entries available to the assistant
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {entries.length === 0 ? (
                <div className="py-8 text-center">
                  <FileText
                    size={40}
                    className="mx-auto mb-3 text-gray-400"
                  />
                  <p className="text-gray-600">
                    No entries yet. Create your first knowledge base entry.
                  </p>
                </div>
              ) : null}

              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {entry.title || "Untitled"}
                      </h3>
                      <Badge variant="secondary" className="mt-1">
                        {entry.source_type || "manual"}
                      </Badge>
                    </div>
                    <div className="ml-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(entry)}
                        className="p-2 text-gray-500 transition-colors hover:text-emerald-600"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        className="p-2 text-gray-500 transition-colors hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <p className="line-clamp-3 text-sm text-gray-600">
                    {entry.content}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    Updated {new Date(entry.updated_at).toLocaleString()}
                  </p>
                </div>
              ))}
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
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Title
                </label>
                <Input
                  value={formData.title}
                  onChange={(event) =>
                    setFormData({ ...formData, title: event.target.value })
                  }
                  placeholder="e.g., Delivery Policy"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Content
                </label>
                <Textarea
                  rows={5}
                  value={formData.content}
                  onChange={(event) =>
                    setFormData({ ...formData, content: event.target.value })
                  }
                  placeholder="Write the knowledge entry..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Source Type
                </label>
                <select
                  value={formData.sourceType}
                  onChange={(event) =>
                    setFormData({ ...formData, sourceType: event.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
                >
                  <option value="manual">Manual</option>
                  <option value="menu">Menu</option>
                  <option value="crawled">Crawled</option>
                  <option value="document">Document</option>
                </select>
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={!formData.title || !formData.content || saving}
                >
                  {saving
                    ? "Saving..."
                    : editingId
                    ? "Update Entry"
                    : "Add Entry"}
                </Button>
                {editingId ? (
                  <Button variant="outline" className="w-full" onClick={resetForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe size={20} />
            Crawl Website
          </CardTitle>
          <CardDescription>
            Automatically extract knowledge base entries from your website. Crawls up to 10 pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {crawlError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {crawlError}
            </div>
          ) : null}
          {crawlResult ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              Done! Created <strong>{crawlResult.entries_created}</strong> entries from{" "}
              <strong>{crawlResult.pages_crawled}</strong> pages.
            </div>
          ) : null}
          <div className="flex gap-3">
            <Input
              className="flex-1"
              value={crawlUrl}
              onChange={(e) => setCrawlUrl(e.target.value)}
              placeholder="https://yourwebsite.com"
              type="url"
              disabled={crawling}
            />
            <Button
              onClick={handleCrawl}
              disabled={!crawlUrl.trim() || crawling}
              className="shrink-0"
            >
              {crawling ? "Crawling…" : "Crawl"}
            </Button>
          </div>
          {crawling ? (
            <p className="text-sm text-gray-500">
              Crawling pages and extracting content — this may take up to 30 seconds…
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
          <CardDescription>Knowledge base coverage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-emerald-50 p-4">
              <div className="text-2xl font-bold text-emerald-600">
                {entries.length}
              </div>
              <div className="text-sm text-emerald-700">
                Total Entries
              </div>
            </div>
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="text-2xl font-bold text-blue-600">
                {new Set(entries.map((entry) => entry.source_type || "manual")).size}
              </div>
              <div className="text-sm text-blue-700">
                Source Types
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <div className="text-2xl font-bold text-purple-600">
                {Math.round(
                  entries.reduce((acc, entry) => acc + entry.content.length, 0) / 100
                )}
              </div>
              <div className="text-sm text-purple-700">
                Approx. Tokens
              </div>
            </div>
            <div className="rounded-lg bg-orange-50 p-4">
              <div className="text-2xl font-bold text-orange-600">
                {entries.filter((entry) => entry.source_type === "document").length}
              </div>
              <div className="text-sm text-orange-700">
                Documents
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
