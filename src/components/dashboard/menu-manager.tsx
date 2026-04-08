"use client";

import { useState } from "react";
import { Edit2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MenuItem, Restaurant } from "@/lib/types";

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
    category: "General",
    isAvailable: true,
  });

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      name: "",
      description: "",
      price: "",
      category: "General",
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
        setError(result.error || "Failed to save menu item.");
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
          : "Failed to save menu item."
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
        setError(result.error || "Failed to delete menu item.");
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
          : "Failed to delete menu item."
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
        setError(result.error || "Failed to crawl menu.");
        return;
      }

      setCrawlMessage(
        `Imported ${result.items_extracted} items and created ${result.knowledge_base_entries} knowledge base entries.`
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
          : "Failed to crawl menu."
      );
    } finally {
      setIsCrawling(false);
    }
  };

  const availableItems = items.filter((item) => item.is_available);
  const unavailableItems = items.filter((item) => !item.is_available);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Menu Crawling</CardTitle>
          <CardDescription>
            Import menu items from the restaurant’s public menu URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          ) : null}

          {crawlMessage ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
              {crawlMessage}
            </div>
          ) : null}

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Menu URL
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
              {isCrawling ? "Crawling..." : "Crawl Menu"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">All ({items.length})</TabsTrigger>
              <TabsTrigger value="available">
                Available ({availableItems.length})
              </TabsTrigger>
              <TabsTrigger value="unavailable">
                Unavailable ({unavailableItems.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4 space-y-3">
              {items.length === 0 ? (
                <div className="py-8 text-center text-gray-600 dark:text-gray-400">
                  No items yet. Add the first menu item or import from a menu URL.
                </div>
              ) : null}
              {items.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => handleEdit(item)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </TabsContent>

            <TabsContent value="available" className="mt-4 space-y-3">
              {availableItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => handleEdit(item)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </TabsContent>

            <TabsContent value="unavailable" className="mt-4 space-y-3">
              {unavailableItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => handleEdit(item)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </TabsContent>
          </Tabs>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus size={20} />
                {editingId ? "Edit Item" : "Add Item"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Name
                </label>
                <Input
                  value={formData.name}
                  onChange={(event) =>
                    setFormData({ ...formData, name: event.target.value })
                  }
                  placeholder="e.g., Grilled Salmon"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Description
                </label>
                <Input
                  value={formData.description}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      description: event.target.value,
                    })
                  }
                  placeholder="Item description"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Price
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
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(event) =>
                      setFormData({ ...formData, category: event.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-50"
                  >
                    <option>General</option>
                    <option>Main Course</option>
                    <option>Starters</option>
                    <option>Desserts</option>
                    <option>Beverages</option>
                    <option>Sides</option>
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
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Available
                </span>
              </label>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={!formData.name || !formData.price || isSaving}
                >
                  {isSaving
                    ? "Saving..."
                    : editingId
                    ? "Update Item"
                    : "Add Item"}
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
    </div>
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
  const name = item.name_en || item.name_ar || "Untitled item";
  const description = item.description_en || item.description_ar || "";

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h4 className="font-semibold text-gray-900 dark:text-gray-50">
              {name}
            </h4>
            <Badge variant={item.is_available ? "default" : "secondary"}>
              {item.is_available ? "Available" : "Unavailable"}
            </Badge>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {description || "No description"}
          </p>
          <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-50">
            {item.price} {item.currency}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
            {item.category}
          </p>
        </div>
        <div className="ml-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="p-2 text-gray-500 transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
            title="Edit"
          >
            <Edit2 size={16} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-2 text-gray-500 transition-colors hover:text-red-600 dark:hover:text-red-400"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
