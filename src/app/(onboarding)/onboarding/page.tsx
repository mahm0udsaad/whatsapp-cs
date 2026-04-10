"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Check, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { RestaurantWebsiteCrawlResponse } from "@/lib/types";

type Step = 1 | 2 | 3 | 4;

interface OnboardingData {
  restaurantName: string;
  displayName: string;
  country: string;
  currency: string;
  websiteUrl: string;
  agentName: string;
  personality: string;
  language: string;
  agentInstructions: string;
  menuUrl: string;
  logoUrl: string;
  telephone: string;
  openingHours: string;
  servesCuisine: string;
  botPhoneNumber: string;
}

const STEPS = [
  { number: 1, title: "Restaurant Info" },
  { number: 2, title: "AI Agent" },
  { number: 3, title: "WhatsApp Profile" },
  { number: 4, title: "Menu Source" },
];

const DEFAULT_AGENT_INSTRUCTIONS =
  "You are the restaurant's WhatsApp assistant. Answer only restaurant-related questions, stay concise, and be friendly.";

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [websiteImporting, setWebsiteImporting] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [websiteImportMessage, setWebsiteImportMessage] = useState("");
  const [websiteImportSummary, setWebsiteImportSummary] = useState<string[]>([]);
  const [data, setData] = useState<OnboardingData>({
    restaurantName: "",
    displayName: "",
    country: "SA",
    currency: "SAR",
    websiteUrl: "",
    agentName: "Restaurant Assistant",
    personality: "friendly",
    language: "auto",
    agentInstructions: DEFAULT_AGENT_INSTRUCTIONS,
    menuUrl: "",
    logoUrl: "",
    telephone: "",
    openingHours: "",
    servesCuisine: "",
    botPhoneNumber: "",
  });

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step);
    }
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return data.restaurantName.trim() !== "";
      case 2:
        return (
          data.agentName.trim() !== "" && data.agentInstructions.trim() !== ""
        );
      case 3:
        // botPhoneNumber is optional — users can complete it later from the dashboard.
        return data.displayName.trim() !== "";
      case 4:
        return true;
      default:
        return false;
    }
  };

  const submitOnboarding = async () => {
    setLoading(true);
    setError("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to finish onboarding.");
        return;
      }

      if (result.assignedPhoneNumber) {
        setStatusMessage(
          `Provisioning complete. Your WhatsApp number is ${result.assignedPhoneNumber}.`
        );
      } else {
        setStatusMessage(
          "Your restaurant and agent are ready. WhatsApp number assignment is pending inventory or sender registration."
        );
      }

      router.push("/dashboard");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to finish onboarding."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (currentStep === 4) {
      await submitOnboarding();
      return;
    }

    setCurrentStep((currentStep + 1) as Step);
  };

  const handleWebsiteImport = async () => {
    if (!data.websiteUrl.trim()) {
      setError("Add the restaurant website URL first.");
      return;
    }

    setWebsiteImporting(true);
    setError("");
    setStatusMessage("");
    setWebsiteImportMessage("");
    setWebsiteImportSummary([]);

    try {
      const response = await fetch("/api/onboarding/crawl-website", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: data.websiteUrl }),
      });

      const result = (await response.json()) as
        | RestaurantWebsiteCrawlResponse
        | { error?: string };

      if (!response.ok) {
        const crawlError =
          "error" in result ? result.error : undefined;
        setError(crawlError || "Failed to crawl website.");
        return;
      }

      if (!("prefill" in result)) {
        setError("Website crawl returned an invalid response.");
        return;
      }

      const prefill = result.prefill;
      setData((current) => {
        const nextRestaurantName =
          prefill.restaurantName || current.restaurantName;

        return {
          ...current,
          restaurantName: nextRestaurantName,
          displayName: prefill.displayName || nextRestaurantName || current.displayName,
          country: prefill.country || current.country,
          currency: prefill.currency || current.currency,
          websiteUrl: prefill.websiteUrl || current.websiteUrl,
          menuUrl: prefill.menuUrl || current.menuUrl,
          logoUrl: prefill.logoUrl || current.logoUrl,
          telephone: prefill.telephone || current.telephone,
          openingHours: prefill.openingHours || current.openingHours,
          servesCuisine: prefill.businessCategory || current.servesCuisine,
          language:
            prefill.language && current.language === "auto"
              ? prefill.language
              : current.language,
          agentName:
            current.agentName === "Restaurant Assistant" && nextRestaurantName
              ? `${nextRestaurantName} Assistant`
              : current.agentName,
          agentInstructions:
            current.agentInstructions === DEFAULT_AGENT_INSTRUCTIONS &&
            prefill.agentInstructions
              ? prefill.agentInstructions
              : current.agentInstructions,
        };
      });

      const importedCount = result.importedFields.length;
      setWebsiteImportMessage(
        importedCount > 0
          ? `Imported ${importedCount} field${importedCount === 1 ? "" : "s"} from the website.`
          : "We couldn't read much from this site — it may be JavaScript-rendered. Fields have been left for manual entry."
      );
      setWebsiteImportSummary(result.summary);
    } catch (crawlError) {
      setError(
        crawlError instanceof Error
          ? crawlError.message
          : "Failed to crawl website."
      );
    } finally {
      setWebsiteImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">
            Launch Your WhatsApp Assistant
          </h1>
          <p className="text-gray-600">
            This setup creates your restaurant workspace, AI agent, and the
            records needed to provision a WhatsApp sender.
          </p>
        </div>

        <div className="mb-8 flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold transition-all",
                    currentStep >= step.number
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-200 text-gray-600"
                  )}
                >
                  {currentStep > step.number ? <Check size={24} /> : step.number}
                </div>
                <span className="mt-2 hidden text-center text-xs font-medium sm:block">
                  {step.title}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-1 w-8",
                    currentStep > step.number
                      ? "bg-emerald-600"
                      : "bg-gray-200"
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {statusMessage}
              </div>
            ) : null}

            {currentStep === 1 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Restaurant Name
                  </label>
                  <Input
                    placeholder="e.g., Test Restaurant"
                    value={data.restaurantName}
                    onChange={(event) =>
                      setData({ ...data, restaurantName: event.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Country
                    </label>
                    <Select
                      value={data.country}
                      onValueChange={(value) =>
                        setData({ ...data, country: value })
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
                    <label className="text-sm font-medium text-gray-700">
                      Currency
                    </label>
                    <Select
                      value={data.currency}
                      onValueChange={(value) =>
                        setData({ ...data, currency: value })
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

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Website URL
                  </label>
                  <div className="flex flex-col gap-3 md:flex-row">
                    <Input
                      type="url"
                      placeholder="https://restaurant.com"
                      value={data.websiteUrl}
                      onChange={(event) =>
                        setData({ ...data, websiteUrl: event.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleWebsiteImport}
                      disabled={websiteImporting || !data.websiteUrl.trim()}
                      className="gap-2 md:w-auto"
                    >
                      <RefreshCw
                        size={16}
                        className={websiteImporting ? "animate-spin" : ""}
                      />
                      {websiteImporting ? "Crawling..." : "Import Website Info"}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600">
                    Pulls name, logo, menu URL, country, currency, contact phone, and hours from the public website. Any detected phone is saved as the restaurant&apos;s contact number — the bot&apos;s WhatsApp number is assigned separately.
                  </p>
                </div>

                {websiteImportMessage ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-start gap-3">
                      {data.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={data.logoUrl}
                          alt="Detected logo"
                          className="h-10 w-10 shrink-0 rounded-md border border-emerald-200 bg-white object-contain p-0.5"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <Sparkles className="mt-0.5 shrink-0 text-emerald-700" size={18} />
                      )}
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-emerald-900">
                          {websiteImportMessage}
                        </p>
                        {websiteImportSummary.length ? (
                          <div className="space-y-1">
                            {websiteImportSummary.map((item) => (
                              <p
                                key={item}
                                className="text-sm text-emerald-800"
                              >
                                {item}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <h4 className="mb-2 text-sm font-semibold text-blue-900">
                    Faster setup option
                  </h4>
                  <p className="text-sm text-blue-800">
                    Manual entry still works. Website import just prefills the
                    next steps so you can review and adjust before provisioning.
                  </p>
                </div>
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    AI Agent Name
                  </label>
                  <Input
                    placeholder="e.g., Restaurant Assistant"
                    value={data.agentName}
                    onChange={(event) =>
                      setData({ ...data, agentName: event.target.value })
                    }
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700">
                    Personality Style
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        value: "friendly",
                        label: "Friendly",
                        desc: "Warm and welcoming",
                      },
                      {
                        value: "professional",
                        label: "Professional",
                        desc: "Clear and precise",
                      },
                      {
                        value: "creative",
                        label: "Creative",
                        desc: "More expressive replies",
                      },
                      {
                        value: "strict",
                        label: "Strict",
                        desc: "Direct and efficient",
                      },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setData({ ...data, personality: option.value })
                        }
                        className={cn(
                          "rounded-lg border-2 p-3 text-left transition-all",
                          data.personality === option.value
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-gray-200 hover:border-gray-300"
                        )}
                      >
                        <div className="text-sm font-medium">{option.label}</div>
                        <div className="text-xs text-gray-600">
                          {option.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Preferred Language
                  </label>
                  <Select
                    value={data.language}
                    onValueChange={(value) =>
                      setData({ ...data, language: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ar">Arabic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Agent Instructions
                  </label>
                  <Textarea
                    rows={6}
                    value={data.agentInstructions}
                    onChange={(event) =>
                      setData({
                        ...data,
                        agentInstructions: event.target.value,
                      })
                    }
                    placeholder="Describe how the assistant should answer customers."
                  />
                </div>
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    WhatsApp Display Name
                  </label>
                  <Input
                    placeholder="The business name customers see in WhatsApp"
                    value={data.displayName}
                    onChange={(event) =>
                      setData({ ...data, displayName: event.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Bot Phone Number
                  </label>
                  <Input
                    type="tel"
                    placeholder="+966XXXXXXXXX"
                    value={data.botPhoneNumber}
                    onChange={(event) =>
                      setData({ ...data, botPhoneNumber: event.target.value })
                    }
                  />
                  <p className="text-xs text-gray-600">
                    Enter the phone number in international format (e.g. +966542228723). This number will be registered in Twilio and configured to route messages to the bot.
                  </p>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-1">
                  <h4 className="text-sm font-semibold text-amber-900">
                    Important — before you continue
                  </h4>
                  <p className="text-sm text-amber-800">
                    This phone number <span className="font-semibold">must not have an active WhatsApp account</span>. If there is a WhatsApp account associated with it, please remove it from that device before proceeding.
                  </p>
                  <p className="text-sm text-amber-700">
                    To remove WhatsApp from a number: open WhatsApp → Settings → Account → Delete my account, or simply uninstall the app and request account deletion via the WhatsApp website.
                  </p>
                </div>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Digital Menu URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://restaurant.com/menu"
                    value={data.menuUrl}
                    onChange={(event) =>
                      setData({ ...data, menuUrl: event.target.value })
                    }
                  />
                  <p className="text-xs text-gray-600">
                    Optional. This is stored now and can be crawled later.
                  </p>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <h4 className="mb-2 text-sm font-semibold text-emerald-900">
                    Ready to provision
                  </h4>
                  <p className="text-sm text-emerald-800">
                    Finishing this step creates your tenant records, starter
                    knowledge base, and active AI agent configuration.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-gray-200 pt-6">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 1 || loading}
              >
                <ChevronLeft size={18} />
                Previous
              </Button>

              <div className="text-sm text-gray-600">
                Step {currentStep} of {STEPS.length}
              </div>

              <Button onClick={handleNext} disabled={!isStepValid() || loading}>
                {currentStep === 4 ? (
                  <>
                    {loading ? "Provisioning..." : "Finish Setup"}
                    <Check size={18} />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight size={18} />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
