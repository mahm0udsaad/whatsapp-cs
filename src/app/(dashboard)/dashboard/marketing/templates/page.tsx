"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, Trash2, Copy } from "lucide-react";

interface Template {
  id: number;
  name: string;
  category: string;
  content: string;
  variables: string[];
  preview: string;
  createdAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([
    {
      id: 1,
      name: "Order Confirmation",
      category: "Transactional",
      content:
        "Hi {{customer_name}}, your order #{{order_id}} has been confirmed. Total: {{amount}} EGP. Delivery in {{time}} mins.",
      variables: ["customer_name", "order_id", "amount", "time"],
      preview:
        "Hi Ahmed, your order #12345 has been confirmed. Total: 250 EGP. Delivery in 45 mins.",
      createdAt: "2024-03-15",
    },
    {
      id: 2,
      name: "Special Offer",
      category: "Promotional",
      content:
        "🎉 {{customer_name}}, enjoy {{discount}}% off on {{item}}! Valid until {{date}}. Order now!",
      variables: ["customer_name", "discount", "item", "date"],
      preview:
        "🎉 Ahmed, enjoy 30% off on Grilled Salmon! Valid until 2024-03-31. Order now!",
      createdAt: "2024-03-10",
    },
    {
      id: 3,
      name: "Delivery Update",
      category: "Informational",
      content:
        "Your order is on the way! Driver {{driver_name}} will arrive in {{mins}} minutes. Track: {{link}}",
      variables: ["driver_name", "mins", "link"],
      preview:
        "Your order is on the way! Driver Ahmed will arrive in 10 minutes. Track: https://...",
      createdAt: "2024-03-05",
    },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "Promotional",
    content: "",
  });

  const handleAddTemplate = () => {
    if (formData.name && formData.content) {
      const variables = formData.content
        .match(/{{(\w+)}}/g)
        ?.map((v) => v.slice(2, -2)) || [];

      setTemplates([
        ...templates,
        {
          id: Math.max(0, ...templates.map((t) => t.id)) + 1,
          ...formData,
          variables,
          preview: formData.content,
          createdAt: new Date().toISOString().split("T")[0],
        },
      ]);

      setFormData({
        name: "",
        category: "Promotional",
        content: "",
      });
      setShowForm(false);
    }
  };

  const handleDeleteTemplate = (id: number) => {
    setTemplates(templates.filter((t) => t.id !== id));
  };

  const handleCopyTemplate = (id: number) => {
    const template = templates.find((t) => t.id === id);
    if (template) {
      navigator.clipboard.writeText(template.content);
    }
  };

  const categoryCounts = {
    Promotional: templates.filter((t) => t.category === "Promotional").length,
    Transactional: templates.filter((t) => t.category === "Transactional")
      .length,
    Informational: templates.filter((t) => t.category === "Informational")
      .length,
  };

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
            WhatsApp Templates
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Create and manage WhatsApp message templates
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus size={18} />
          New Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(categoryCounts).map(([category, count]) => (
          <Card key={category}>
            <CardContent className="p-6">
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {count}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {category} Templates
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Template</CardTitle>
            <CardDescription>
              {"Use {{variable}} syntax for dynamic content"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Template Name
              </label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Order Confirmation"
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
                <option>Promotional</option>
                <option>Transactional</option>
                <option>Informational</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Message Content
              </label>
              <Textarea
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                placeholder="Type your message. Use {{variable_name}} for dynamic content."
                rows={6}
              />
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {"Supported variables: {{customer_name}}, {{order_id}}, {{amount}}, {{time}}, etc."}
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleAddTemplate} disabled={!formData.name || !formData.content}>
                Create Template
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-50">
                    {template.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary">{template.category}</Badge>
                    {template.variables.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {template.variables.length} variables
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyTemplate(template.id)}
                    className="p-2 text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    title="Copy"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {template.content}
                  </p>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs font-medium text-emerald-900 dark:text-emerald-200 mb-1">
                    Preview
                  </p>
                  <p className="text-sm text-emerald-800 dark:text-emerald-300">
                    {template.preview}
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                Created {template.createdAt}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
