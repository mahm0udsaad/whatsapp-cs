"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Restaurant } from "@/lib/types";

interface RestaurantSettingsFormProps {
  restaurant: Restaurant;
}

export function RestaurantSettingsForm({
  restaurant,
}: RestaurantSettingsFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [provisioningMessage, setProvisioningMessage] = useState("");
  const [formData, setFormData] = useState({
    name: restaurant.name,
    nameAr: restaurant.name_ar || "",
    country: restaurant.country,
    currency: restaurant.currency,
    websiteUrl: restaurant.website_url || "",
    menuUrl: restaurant.digital_menu_url || "",
  });

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    setError("");

    try {
      const response = await fetch("/api/dashboard/restaurant", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          name_ar: formData.nameAr,
          country: formData.country,
          currency: formData.currency,
          website_url: formData.websiteUrl,
          digital_menu_url: formData.menuUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "تعذر حفظ إعدادات المطعم.");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "تعذر حفظ إعدادات المطعم."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleProvisioningRetry = async () => {
    setIsProvisioning(true);
    setError("");
    setProvisioningMessage("");

    try {
      const response = await fetch("/api/dashboard/provisioning", {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "تعذر تشغيل التفعيل.");
        return;
      }

      if (result.assignedPhoneNumber) {
        setProvisioningMessage(
          `اكتمل التفعيل. رقم واتساب المخصص: ${result.assignedPhoneNumber}.`
        );
      } else {
        setProvisioningMessage(
          "تم تشغيل التفعيل بنجاح، لكن لا يوجد رقم واتساب متاح حالياً."
        );
      }

      window.location.reload();
    } catch (provisioningError) {
      setError(
        provisioningError instanceof Error
          ? provisioningError.message
          : "تعذر تشغيل التفعيل."
      );
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>هوية النشاط</CardTitle>
            <CardDescription>
              البيانات الأساسية المستخدمة في التفعيل والردود التي تظهر للعملاء.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  اسم المطعم
                </label>
                <Input
                  value={formData.name}
                  onChange={(event) =>
                    setFormData({ ...formData, name: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  الاسم بالعربية
                </label>
                <Input
                  value={formData.nameAr}
                  onChange={(event) =>
                    setFormData({ ...formData, nameAr: event.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  الدولة
                </label>
                <Select
                  value={formData.country}
                  onValueChange={(value) =>
                    setFormData({ ...formData, country: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EG">مصر</SelectItem>
                    <SelectItem value="SA">السعودية</SelectItem>
                    <SelectItem value="AE">الإمارات</SelectItem>
                    <SelectItem value="KW">الكويت</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  العملة
                </label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) =>
                    setFormData({ ...formData, currency: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EGP">EGP</SelectItem>
                    <SelectItem value="SAR">SAR</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="KWD">KWD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>المصادر الرقمية</CardTitle>
            <CardDescription>
              روابط الهوية العامة ومزامنة القائمة لاحقاً.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                رابط الموقع
              </label>
              <Input
                type="url"
                value={formData.websiteUrl}
                onChange={(event) =>
                  setFormData({ ...formData, websiteUrl: event.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                رابط القائمة
              </label>
              <Input
                type="url"
                value={formData.menuUrl}
                onChange={(event) =>
                  setFormData({ ...formData, menuUrl: event.target.value })
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="sticky top-4">
          <CardHeader>
            <CardTitle className="text-lg">حالة الحساب</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {saved ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                <Check size={16} />
                تم حفظ التغييرات.
              </div>
            ) : null}

            {provisioningMessage ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                {provisioningMessage}
              </div>
            ) : null}

            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">الإعداد</span>
                <span className="font-medium text-gray-900">
                  {restaurant.setup_status || "draft"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-gray-600">
                  رقم واتساب
                </span>
                <span className="font-medium text-gray-900">
                  {restaurant.twilio_phone_number || "قيد الانتظار"}
                </span>
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleProvisioningRetry}
              disabled={isProvisioning}
            >
              {isProvisioning ? "جارٍ التفعيل..." : "إعادة محاولة تفعيل واتساب"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
