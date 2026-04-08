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
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

const STEPS = [
  { number: 1, title: "Restaurant Info" },
  { number: 2, title: "AI Agent" },
  { number: 3, title: "WhatsApp Profile" },
  { number: 4, title: "Menu Source" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [data, setData] = useState<OnboardingData>({
    restaurantName: "",
    displayName: "",
    country: "SA",
    currency: "SAR",
    websiteUrl: "",
    agentName: "Restaurant Assistant",
    personality: "friendly",
    language: "auto",
    agentInstructions:
      "You are the restaurant's WhatsApp assistant. Answer only restaurant-related questions, stay concise, and be friendly.",
    menuUrl: "",
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 p-4 dark:from-gray-950 dark:to-gray-900">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-gray-50">
            Launch Your WhatsApp Assistant
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
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
                      : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
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
                      : "bg-gray-200 dark:bg-gray-700"
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
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                {statusMessage}
              </div>
            ) : null}

            {currentStep === 1 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Website URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://restaurant.com"
                    value={data.websiteUrl}
                    onChange={(event) =>
                      setData({ ...data, websiteUrl: event.target.value })
                    }
                  />
                </div>
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                            : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                        )}
                      >
                        <div className="text-sm font-medium">{option.label}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {option.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                  <h4 className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
                    What happens after this step
                  </h4>
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    The system creates your restaurant workspace now. If a ready
                    WhatsApp sender is available in inventory, it will be
                    assigned immediately. Otherwise your workspace is created in
                    a pending WhatsApp state until sender registration is
                    completed.
                  </p>
                </div>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Optional. This is stored now and can be crawled later.
                  </p>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                  <h4 className="mb-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                    Ready to provision
                  </h4>
                  <p className="text-sm text-emerald-800 dark:text-emerald-300">
                    Finishing this step creates your tenant records, starter
                    knowledge base, and active AI agent configuration.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-gray-200 pt-6 dark:border-gray-800">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 1 || loading}
              >
                <ChevronLeft size={18} />
                Previous
              </Button>

              <div className="text-sm text-gray-600 dark:text-gray-400">
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
