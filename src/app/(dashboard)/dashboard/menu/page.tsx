"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Edit2, RefreshCw } from "lucide-react";

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  isAvailable: boolean;
}

export default function MenuPage() {
  const [isCrawling, setIsCrawling] = useState(false);
  const [menuUrl, setMenuUrl] = useState("https://restaurant.com/menu");
  const [items, setItems] = useState<MenuItem[]>([
    {
      id: 1,
      name: "Grilled Salmon",
      description: "Fresh salmon fillet with lemon butter sauce",
      price: 185,
      category: "Main Course",
      isAvailable: true,
    },
    {
      id: 2,
      name: "Caesar Salad",
      description: "Crispy romaine with parmesan and house croutons",
      price: 65,
      category: "Starters",
      isAvailable: true,
    },
    {
      id: 3,
      name: "Chocolate Lava Cake",
      description: "Warm chocolate cake with molten center",
      price: 55,
      category: "Desserts",
      isAvailable: false,
    },
    {
      id: 4,
      name: "Pasta Carbonara",
      description: "Creamy Italian pasta with bacon and egg",
      price: 125,
      category: "Main Course",
      isAvailable: true,
    },
  ]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    category: "Main Course",
    isAvailable: true,
  });

  const handleCrawlMenu = async () => {
    setIsCrawling(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsCrawling(false);
  };

  const handleAddItem = () => {
    if (formData.name && formData.price) {
      if (editingId) {
        setItems(
          items.map((item) =>
            item.id === editingId
              ? {
                  ...item,
                  name: formData.name,
                  description: formData.description,
                  price: parseFloat(formData.price),
                  category: formData.category,
                  isAvailable: formData.isAvailable,
                }
              : item
          )
        );
        setEditingId(null);
      } else {
        setItems([
          ...items,
          {
            id: Math.max(0, ...items.map((i) => i.id)) + 1,
            name: formData.name,
            description: formData.description,
            price: parseFloat(formData.price),
            category: formData.category,
            isAvailable: formData.isAvailable,
          },
        ]);
      }
      setFormData({
        name: "",
        description: "",
        price: "",
        category: "Main Course",
        isAvailable: true,
      });
    }
  };

  const handleEdit = (item: MenuItem) => {
    setFormData({
      name: item.name,
      description: item.description,
      price: item.price.toString(),
      category: item.category,
      isAvailable: item.isAvailable,
    });
    setEditingId(item.id);
  };

  const handleDelete = (id: number) => {
    setItems(items.filter((item) => item.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setFormData({
        name: "",
        description: "",
        price: "",
        category: "Main Course",
        isAvailable: true,
      });
    }
  };

  const categories = Array.from(new Set(items.map((item) => item.category)));

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          Menu Management
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Manage your restaurant's menu items
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Menu Crawling</CardTitle>
          <CardDescription>Automatically import menu from your website</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                Menu URL
              </label>
              <Input
                value={menuUrl}
                onChange={(e) => setMenuUrl(e.target.value)}
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
          <p className="text-xs text-gray-600 dark:text-gray-400">
            We'll extract menu items, prices, and descriptions from your website and sync them to your knowledge base.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">
                All ({items.length})
              </TabsTrigger>
              <TabsTrigger value="available">
                Available ({items.filter((i) => i.isAvailable).length})
              </TabsTrigger>
              <TabsTrigger value="unavailable">
                Unavailable ({items.filter((i) => !i.isAvailable).length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-3 mt-4">
              {items.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-gray-400">
                    No items yet. Add your first menu item!
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onEdit={() => handleEdit(item)}
                    onDelete={() => handleDelete(item.id)}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="available" className="space-y-3 mt-4">
              {items
                .filter((i) => i.isAvailable)
                .map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onEdit={() => handleEdit(item)}
                    onDelete={() => handleDelete(item.id)}
                  />
                ))}
            </TabsContent>

            <TabsContent value="unavailable" className="space-y-3 mt-4">
              {items
                .filter((i) => !i.isAvailable)
                .map((item) => (
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
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
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
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
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
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
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
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-50 text-sm"
                  >
                    <option>Main Course</option>
                    <option>Starters</option>
                    <option>Desserts</option>
                    <option>Beverages</option>
                    <option>Sides</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isAvailable}
                  onChange={(e) =>
                    setFormData({ ...formData, isAvailable: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Available
                </span>
              </label>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleAddItem}
                  disabled={!formData.name || !formData.price}
                >
                  {editingId ? "Update Item" : "Add Item"}
                </Button>
                {editingId && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setEditingId(null);
                      setFormData({
                        name: "",
                        description: "",
                        price: "",
                        category: "Main Course",
                        isAvailable: true,
                      });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface MenuItemCardProps {
  item: MenuItem;
  onEdit: () => void;
  onDelete: () => void;
}

function MenuItemCard({ item, onEdit, onDelete }: MenuItemCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-gray-50">
                {item.name}
              </h3>
              {!item.isAvailable && (
                <Badge variant="destructive">Out of Stock</Badge>
              )}
            </div>
            <Badge variant="secondary" className="mt-1">
              {item.category}
            </Badge>
          </div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 ml-2">
            {item.price} EGP
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {item.description}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="p-2 text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            title="Edit"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
