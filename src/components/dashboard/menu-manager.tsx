"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Edit2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MenuItem, Restaurant } from "@/lib/types";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
type TabKey = "all" | "available" | "unavailable";

interface MenuManagerProps {
  restaurant: Restaurant;
  initialItems: MenuItem[];
}

export function MenuManager({ restaurant, initialItems }: MenuManagerProps) {
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [error, setError] = useState("");
  const [crawlMessage, setCrawlMessage] = useState("");
  const [menuUrl, setMenuUrl] = useState(restaurant.digital_menu_url || "");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    category: "عام",
    isAvailable: true,
  });

  // Pagination + search state — shared across tabs. Tab/query/pageSize change
  // resets to page 1 (handled by the effects below).
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  useEffect(() => {
    setPage(1);
  }, [activeTab, query, pageSize]);

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      name: "",
      description: "",
      price: "",
      category: "عام",
      isAvailable: true,
    });
  };

  const handleSubmit = async () => {
    setError("");
    setIsSaving(true);

    const url = editingId
      ? `/api/dashboard/menu/${editingId}`
      : "/api/dashboard/menu";
    const method = editingId ? "PATCH" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name_en: formData.name,
          description_en: formData.description,
          price: Number(formData.price),
          category: formData.category,
          is_available: formData.isAvailable,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "تعذر حفظ عنصر القائمة.");
        return;
      }

      if (editingId) {
        setItems((prev) =>
          prev.map((item) => (item.id === editingId ? result.item : item))
        );
      } else {
        setItems((prev) => [result.item, ...prev]);
      }

      resetForm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "تعذر حفظ عنصر القائمة."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError("");

    try {
      const response = await fetch(`/api/dashboard/menu/${id}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "تعذر حذف عنصر القائمة.");
        return;
      }

      setItems((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "تعذر حذف عنصر القائمة."
      );
    }
  };

  const handleEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setFormData({
      name: item.name_en || item.name_ar || "",
      description: item.description_en || item.description_ar || "",
      price: String(item.price),
      category: item.category,
      isAvailable: item.is_available,
    });
  };

  const handleCrawlMenu = async () => {
    if (!menuUrl) {
      return;
    }

    setIsCrawling(true);
    setError("");
    setCrawlMessage("");

    try {
      const response = await fetch("/api/menu/crawl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          url: menuUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "تعذر قراءة القائمة.");
        return;
      }

      setCrawlMessage(
        `تم استيراد ${result.items_extracted} عنصر وإنشاء ${result.knowledge_base_entries} إدخال في قاعدة المعرفة.`
      );

      const refreshed = await fetch(window.location.pathname, {
        method: "GET",
        cache: "no-store",
      });

      if (refreshed.ok) {
        window.location.reload();
      }
    } catch (crawlError) {
      setError(
        crawlError instanceof Error
          ? crawlError.message
          : "تعذر قراءة القائمة."
      );
    } finally {
      setIsCrawling(false);
    }
  };

  const availableItems = useMemo(
    () => items.filter((item) => item.is_available),
    [items]
  );
  const unavailableItems = useMemo(
    () => items.filter((item) => !item.is_available),
    [items]
  );

  const tabItems: Record<TabKey, MenuItem[]> = {
    all: items,
    available: availableItems,
    unavailable: unavailableItems,
  };

  const sourceForActive = tabItems[activeTab];

  // Filter the active list by search query (matches Arabic + English names,
  // descriptions, and category — case-insensitive).
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sourceForActive;
    return sourceForActive.filter((item) => {
      const haystack = [
        item.name_ar,
        item.name_en,
        item.description_ar,
        item.description_en,
        item.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sourceForActive, query]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filteredItems.length);
  const pageItems = filteredItems.slice(startIdx, endIdx);

  // If the current page becomes empty (e.g. after deleting the last row on
  // it), bounce back one page so the list doesn't look empty.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>قراءة القائمة</CardTitle>
          <CardDescription>
            استورد عناصر القائمة من رابط القائمة العام للمتجر.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {crawlMessage ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {crawlMessage}
            </div>
          ) : null}

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                رابط القائمة
              </label>
              <Input
                value={menuUrl}
                onChange={(event) => setMenuUrl(event.target.value)}
                placeholder="https://yourrestaurant.com/menu"
              />
            </div>
            <Button
              onClick={handleCrawlMenu}
              disabled={isCrawling || !menuUrl}
              className="gap-2"
            >
              <RefreshCw size={18} />
              {isCrawling ? "جارٍ قراءة القائمة..." : "قراءة القائمة"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabKey)}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">الكل ({items.length})</TabsTrigger>
              <TabsTrigger value="available">
                المتاح ({availableItems.length})
              </TabsTrigger>
              <TabsTrigger value="unavailable">
                غير المتاح ({unavailableItems.length})
              </TabsTrigger>
            </TabsList>

            {/* Search + page-size controls — visible across all tabs */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <label htmlFor="menu-search" className="sr-only">
                  البحث في العناصر
                </label>
                <Input
                  id="menu-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحثي بالاسم، الوصف، أو الفئة…"
                  className="ps-9"
                  dir="rtl"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <span>العرض:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  aria-label="عدد العناصر في الصفحة"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Single shared list — TabsContent triggers re-render via activeTab */}
            <TabsContent value={activeTab} className="mt-4 space-y-3">
              {filteredItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-gray-600">
                  {query
                    ? `لا توجد نتائج لـ "${query}".`
                    : "لا توجد عناصر بعد. أضيفي أول عنصر أو استوردي من رابط القائمة."}
                </div>
              ) : (
                <>
                  {pageItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      onEdit={() => handleEdit(item)}
                      onDelete={() => handleDelete(item.id)}
                    />
                  ))}
                  <PaginationBar
                    page={safePage}
                    totalPages={totalPages}
                    startIdx={startIdx}
                    endIdx={endIdx}
                    total={filteredItems.length}
                    onChange={setPage}
                  />
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus size={20} />
                {editingId ? "تعديل عنصر" : "إضافة عنصر"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  الاسم
                </label>
                <Input
                  value={formData.name}
                  onChange={(event) =>
                    setFormData({ ...formData, name: event.target.value })
                  }
                  placeholder="مثال: سلمون مشوي"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  الوصف
                </label>
                <Input
                  value={formData.description}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      description: event.target.value,
                    })
                  }
                  placeholder="وصف العنصر"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    السعر
                  </label>
                  <Input
                    type="number"
                    value={formData.price}
                    onChange={(event) =>
                      setFormData({ ...formData, price: event.target.value })
                    }
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    الفئة
                  </label>
                  <select
                    value={formData.category}
                    onChange={(event) =>
                      setFormData({ ...formData, category: event.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
                  >
                    <option>عام</option>
                    <option>طبق رئيسي</option>
                    <option>مقبلات</option>
                    <option>حلويات</option>
                    <option>مشروبات</option>
                    <option>إضافات</option>
                  </select>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isAvailable}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      isAvailable: event.target.checked,
                    })
                  }
                  className="h-4 w-4"
                />
                <span className="text-sm text-gray-700">
                  متاح
                </span>
              </label>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={!formData.name || !formData.price || isSaving}
                >
                  {isSaving
                    ? "جارٍ الحفظ..."
                    : editingId
                    ? "تحديث العنصر"
                    : "إضافة العنصر"}
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
    </div>
  );
}

function PaginationBar({
  page,
  totalPages,
  startIdx,
  endIdx,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  startIdx: number;
  endIdx: number;
  total: number;
  onChange: (n: number) => void;
}) {
  if (totalPages <= 1) {
    // Still show the count summary so it's clear there's no hidden page.
    return (
      <p className="px-1 pt-2 text-xs text-slate-500">
        عرض {total} عنصر
      </p>
    );
  }
  return (
    <nav
      aria-label="صفحات قائمة الخدمات"
      className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2 text-xs text-slate-600"
    >
      <p
        className="[font-variant-numeric:tabular-nums]"
        aria-live="polite"
      >
        عرض {startIdx + 1}–{endIdx} من {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(1)}
          disabled={page <= 1}
          aria-label="الصفحة الأولى"
        >
          <ChevronsRight size={14} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="الصفحة السابقة"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </Button>
        <span className="px-2 [font-variant-numeric:tabular-nums]">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="الصفحة التالية"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(totalPages)}
          disabled={page >= totalPages}
          aria-label="الصفحة الأخيرة"
        >
          <ChevronsLeft size={14} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

function MenuItemCard({
  item,
  onEdit,
  onDelete,
}: {
  item: MenuItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const name = item.name_ar || item.name_en || "عنصر بدون اسم";
  const description = item.description_ar || item.description_en || "";

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h4 className="font-semibold text-gray-900">
              {name}
            </h4>
            <Badge variant={item.is_available ? "default" : "secondary"}>
              {item.is_available ? "متاح" : "غير متاح"}
            </Badge>
          </div>
          <p className="text-sm text-gray-600">
            {description || "لا يوجد وصف"}
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900">
            {item.price} {item.currency}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {item.category}
          </p>
        </div>
        <div className="ml-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="p-2 text-gray-500 transition-colors hover:text-emerald-600"
            title="تعديل"
          >
            <Edit2 size={16} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-2 text-gray-500 transition-colors hover:text-red-600"
            title="حذف"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
