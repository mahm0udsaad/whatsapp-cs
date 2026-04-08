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
        setError(result.error || "Failed to save restaurant settings.");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save restaurant settings."
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
        setError(result.error || "Failed to run provisioning.");
        return;
      }

      if (result.assignedPhoneNumber) {
        setProvisioningMessage(
          `Provisioning completed. Assigned WhatsApp number: ${result.assignedPhoneNumber}.`
        );
      } else {
        setProvisioningMessage(
          "Provisioning ran successfully, but no WhatsApp number is currently available."
        );
      }

      window.location.reload();
    } catch (provisioningError) {
      setError(
        provisioningError instanceof Error
          ? provisioningError.message
          : "Failed to run provisioning."
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
            <CardTitle>Business Identity</CardTitle>
            <CardDescription>
              Core tenant information used in provisioning and customer-facing
              responses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Restaurant Name
                </label>
                <Input
                  value={formData.name}
                  onChange={(event) =>
                    setFormData({ ...formData, name: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Arabic Name
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
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Country
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
                    <SelectItem value="EG">Egypt</SelectItem>
                    <SelectItem value="SA">Saudi Arabia</SelectItem>
                    <SelectItem value="AE">UAE</SelectItem>
                    <SelectItem value="KW">Kuwait</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Currency
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
            <CardTitle>Digital Sources</CardTitle>
            <CardDescription>
              URLs used for public identity and future menu synchronization.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Website URL
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
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Menu URL
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
            <CardTitle className="text-lg">Tenant Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            ) : null}

            {saved ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
                <Check size={16} />
                Changes saved.
              </div>
            ) : null}

            {provisioningMessage ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                {provisioningMessage}
              </div>
            ) : null}

            <div className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Setup</span>
                <span className="font-medium text-gray-900 dark:text-gray-50">
                  {restaurant.setup_status || "draft"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">
                  WhatsApp Number
                </span>
                <span className="font-medium text-gray-900 dark:text-gray-50">
                  {restaurant.twilio_phone_number || "Pending"}
                </span>
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleProvisioningRetry}
              disabled={isProvisioning}
            >
              {isProvisioning ? "Provisioning..." : "Retry WhatsApp Provisioning"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
