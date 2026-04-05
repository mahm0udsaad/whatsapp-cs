"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, ChevronLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

interface OnboardingData {
  restaurantName: string;
  country: string;
  currency: string;
  agentName: string;
  personality: string;
  language: string;
  whatsappNumber: string;
  menuUrl: string;
}

const STEPS = [
  { number: 1, title: "Restaurant Info", icon: "🏪" },
  { number: 2, title: "AI Agent", icon: "🤖" },
  { number: 3, title: "WhatsApp Setup", icon: "💬" },
  { number: 4, title: "Menu Setup", icon: "📋" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    restaurantName: "",
    country: "EG",
    currency: "EGP",
    agentName: "Assistant",
    personality: "friendly",
    language: "en",
    whatsappNumber: "",
    menuUrl: "",
  });

  const handleNext = async () => {
    if (currentStep === 4) {
      setLoading(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        router.push("/dashboard");
      } finally {
        setLoading(false);
      }
    } else {
      setCurrentStep((currentStep + 1) as Step);
    }
  };

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
        return data.agentName.trim() !== "";
      case 3:
        return data.whatsappNumber.trim() !== "";
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-gray-950 dark:to-gray-900 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-2">
            Welcome to Your AI Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Let's set up your restaurant's WhatsApp AI agent in 4 simple steps
          </p>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-all",
                      currentStep >= step.number
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                    )}
                  >
                    {currentStep > step.number ? (
                      <Check size={24} />
                    ) : (
                      step.number
                    )}
                  </div>
                  <span className="text-xs font-medium mt-2 text-center hidden sm:block">
                    {step.title}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "w-8 h-1 mx-2",
                      currentStep > step.number
                        ? "bg-emerald-600"
                        : "bg-gray-200 dark:bg-gray-700"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Restaurant Name
                  </label>
                  <Input
                    placeholder="e.g., Delicious Bistro"
                    value={data.restaurantName}
                    onChange={(e) =>
                      setData({ ...data, restaurantName: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Country
                    </label>
                    <Select value={data.country} onValueChange={(value) => setData({ ...data, country: value })}>
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
                    <Select value={data.currency} onValueChange={(value) => setData({ ...data, currency: value })}>
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
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    AI Agent Name
                  </label>
                  <Input
                    placeholder="e.g., Chef's AI Assistant"
                    value={data.agentName}
                    onChange={(e) =>
                      setData({ ...data, agentName: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Personality Style
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: "friendly", label: "😊 Friendly", desc: "Warm & welcoming" },
                      { value: "professional", label: "💼 Professional", desc: "Formal & precise" },
                      { value: "creative", label: "✨ Creative", desc: "Fun & engaging" },
                      { value: "strict", label: "🎯 Strict", desc: "Direct & efficient" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() =>
                          setData({ ...data, personality: option.value })
                        }
                        className={cn(
                          "p-3 rounded-lg border-2 transition-all text-left",
                          data.personality === option.value
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        )}
                      >
                        <div className="font-medium text-sm">{option.label}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">{option.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Preferred Language
                  </label>
                  <Select value={data.language} onValueChange={(value) => setData({ ...data, language: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ar">العربية</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Twilio Phone Number
                  </label>
                  <Input
                    placeholder="+20123456789"
                    value={data.whatsappNumber}
                    onChange={(e) =>
                      setData({ ...data, whatsappNumber: e.target.value })
                    }
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Your WhatsApp Business Account phone number
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-200 mb-3">
                    Next Steps
                  </h4>
                  <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-2">
                    <li>1. Create a WhatsApp Business Account</li>
                    <li>2. Set up Twilio integration</li>
                    <li>3. Verify your phone number</li>
                    <li>4. Connect to this dashboard</li>
                  </ol>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Digital Menu URL (Optional)
                  </label>
                  <Input
                    placeholder="https://yourrestaurant.com/menu"
                    value={data.menuUrl}
                    onChange={(e) =>
                      setData({ ...data, menuUrl: e.target.value })
                    }
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    We'll crawl and index your menu automatically
                  </p>
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <h4 className="font-semibold text-sm text-green-900 dark:text-green-200 mb-2">
                    ✓ You're all set!
                  </h4>
                  <p className="text-sm text-green-800 dark:text-green-300">
                    We're ready to activate your AI agent. You can add or update your menu anytime from the dashboard.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-800">
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

              <Button
                onClick={handleNext}
                disabled={!isStepValid() || loading}
              >
                {currentStep === 4 ? (
                  <>
                    {loading ? "Setting up..." : "Get Started"}
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
