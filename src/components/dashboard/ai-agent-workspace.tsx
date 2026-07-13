"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bot, BookOpen, Brain } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AiAgentWorkspaceTab = "settings" | "training" | "knowledge";

interface AiAgentWorkspaceProps {
  initialTab: AiAgentWorkspaceTab;
  canManageTraining: boolean;
  settings: ReactNode;
  training: ReactNode;
  knowledge: ReactNode;
}

const TAB_META = {
  settings: {
    label: "الإعدادات",
    description: "الهوية وأسلوب الرد",
    icon: Bot,
  },
  training: {
    label: "مدرب الذكاء",
    description: "قواعد التعامل والرد",
    icon: Brain,
  },
  knowledge: {
    label: "قاعدة المعرفة",
    description: "المعلومات والأسئلة الشائعة",
    icon: BookOpen,
  },
} satisfies Record<AiAgentWorkspaceTab, {
  label: string;
  description: string;
  icon: typeof Bot;
}>;

export function AiAgentWorkspace({
  initialTab,
  canManageTraining,
  settings,
  training,
  knowledge,
}: AiAgentWorkspaceProps) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const visibleTabs: AiAgentWorkspaceTab[] = canManageTraining
    ? ["settings", "training", "knowledge"]
    : ["settings", "knowledge"];

  const changeTab = (value: string) => {
    const nextTab = value as AiAgentWorkspaceTab;
    setTab(nextTab);
    router.replace(`/dashboard/ai-agent?tab=${nextTab}`, { scroll: false });
  };

  return (
    <Tabs value={tab} onValueChange={changeTab} dir="rtl">
      <TabsList className="dashboard-tabs grid h-auto w-full grid-cols-1 gap-2 rounded-[var(--radius-lg)] p-2 sm:grid-cols-2 lg:grid-cols-3">
        {visibleTabs.map((value) => {
          const item = TAB_META[value];
          const Icon = item.icon;
          return (
            <TabsTrigger
              key={value}
              value={value}
              className="dashboard-tab-trigger h-auto cursor-pointer justify-start gap-3 rounded-[var(--radius-md)] px-4 py-3 text-right"
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-xs opacity-80">
                  {item.description}
                </span>
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="settings" className="mt-6">
        {settings}
      </TabsContent>
      {canManageTraining ? (
        <TabsContent value="training" className="mt-6">
          {training}
        </TabsContent>
      ) : null}
      <TabsContent value="knowledge" className="mt-6">
        {knowledge}
      </TabsContent>
    </Tabs>
  );
}
