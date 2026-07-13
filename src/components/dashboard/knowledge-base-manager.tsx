"use client";

import { useState } from "react";
import { Edit2, FileText, Globe, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [query, setQuery] = useState("");
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
  const filteredEntries = entries.filter((entry) => {
    const search = query.trim().toLowerCase();
    if (!search) return true;
    return `${entry.title ?? ""} ${entry.content}`.toLowerCase().includes(search);
  });

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
        setError(result.error || "تعذر حفظ الإدخال.");
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
          : "تعذر حفظ الإدخال."
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
        setError(result.error || "تعذر حذف الإدخال.");
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
          : "تعذر حذف الإدخال."
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
        setCrawlError(result.error || "تعذرت قراءة الموقع.");
        return;
      }

      setEntries((prev) => [...(result.entries as KnowledgeBase[]), ...prev]);
      setCrawlResult({
        entries_created: result.entries_created,
        pages_crawled: result.pages_crawled,
      });
    } catch (crawlErr) {
      setCrawlError(
        crawlErr instanceof Error ? crawlErr.message : "تعذرت قراءة الموقع."
      );
    } finally {
      setCrawling(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div>
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-[var(--line)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle>مصادر المعرفة</CardTitle>
                  <CardDescription className="mt-1">{entries.length} إدخال متاح للمساعد</CardDescription>
                </div>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[var(--subtle)]" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في المعرفة" className="pe-9" aria-label="البحث في قاعدة المعرفة" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-[var(--line)] p-0">
              {filteredEntries.length === 0 ? (
                <div className="py-12 text-center">
                  <FileText size={32} className="mx-auto text-[var(--subtle)]" />
                  <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">{entries.length === 0 ? "لا توجد إدخالات بعد" : "لا توجد نتائج مطابقة"}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{entries.length === 0 ? "أضيفي أول معلومة ليستخدمها المساعد." : "جرّبي عبارة بحث أخرى."}</p>
                </div>
              ) : null}

              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="group p-4 transition-colors hover:bg-[#f8f9fd] sm:p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-[var(--foreground)]">
                        {entry.title || "بدون عنوان"}
                      </h3>
                      <Badge variant="secondary" className="mt-2 px-2 py-0.5 text-[10px]">
                        {entry.source_type || "manual"}
                      </Badge>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{entry.content}</p>
                      <p className="mt-2 text-[10px] text-[var(--subtle)]">آخر تحديث {new Date(entry.updated_at).toLocaleDateString("ar")}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleEdit(entry)}
                        className="cursor-pointer rounded-[var(--radius-sm)] p-2 text-[var(--muted)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
                        title="تعديل"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        className="cursor-pointer rounded-[var(--radius-sm)] p-2 text-[var(--muted)] transition-colors hover:bg-red-50 hover:text-red-700"
                        title="حذف"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-6">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-[var(--line)]">
              <CardTitle className="flex items-center gap-2">
                <Plus size={20} />
                {editingId ? "تعديل الإدخال" : "إضافة إدخال"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error ? (
                <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--foreground)]">
                  العنوان
                </label>
                <Input
                  value={formData.title}
                  onChange={(event) =>
                    setFormData({ ...formData, title: event.target.value })
                  }
                  placeholder="مثال: سياسة التوصيل"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--foreground)]">
                  المحتوى
                </label>
                <Textarea
                  rows={5}
                  value={formData.content}
                  onChange={(event) =>
                    setFormData({ ...formData, content: event.target.value })
                  }
                  placeholder="اكتب محتوى الإدخال..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--foreground)]">
                  نوع المصدر
                </label>
                <Select value={formData.sourceType} onValueChange={(value) => setFormData({ ...formData, sourceType: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">يدوي</SelectItem>
                    <SelectItem value="menu">القائمة</SelectItem>
                    <SelectItem value="crawled">موقع مستورد</SelectItem>
                    <SelectItem value="document">مستند</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={!formData.title || !formData.content || saving}
                >
                  {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                  {saving
                    ? "جارٍ الحفظ..."
                    : editingId
                    ? "تحديث الإدخال"
                    : "إضافة الإدخال"}
                </Button>
                {editingId ? (
                  <Button variant="outline" className="w-full" onClick={resetForm}>
                    إلغاء
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[var(--line)]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-soft)] text-[var(--brand)]"><Globe size={19} /></div>
            <div>
              <CardTitle>استيراد المعرفة من الموقع</CardTitle>
              <CardDescription className="mt-1">اقرئي حتى 10 صفحات وحوّلي محتواها إلى معلومات يستخدمها المساعد.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {crawlError ? (
            <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {crawlError}
            </div>
          ) : null}
          {crawlResult ? (
            <div className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              تم الإنشاء. أُضيف <strong>{crawlResult.entries_created}</strong> إدخال من{" "}
              <strong>{crawlResult.pages_crawled}</strong> صفحة.
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
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
              {crawling ? <Loader2 className="animate-spin" /> : <Globe />}
              {crawling ? "جارٍ القراءة..." : "قراءة الموقع"}
            </Button>
          </div>
          {crawling ? (
            <p className="text-sm text-[var(--muted)]">
              جارٍ قراءة الصفحات واستخراج المحتوى. قد يستغرق ذلك حتى 30 ثانية...
            </p>
          ) : null}
        </CardContent>
      </Card>

    </div>
  );
}
