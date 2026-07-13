"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download, ListTree, Settings2, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface WorkspaceTab {
  value: string;
  label: string;
  description: string;
  icon: typeof Users;
  content: ReactNode;
}

function ManagementWorkspace({
  path,
  initialTab,
  tabs,
}: {
  path: string;
  initialTab: string;
  tabs: WorkspaceTab[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);

  const changeTab = (value: string) => {
    setTab(value);
    router.replace(`${path}?tab=${value}`, { scroll: false });
  };

  return (
    <Tabs value={tab} onValueChange={changeTab} dir="rtl">
      <TabsList className="dashboard-tabs grid h-auto w-full max-w-2xl grid-cols-2 gap-2 rounded-[var(--radius-lg)] p-2">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="dashboard-tab-trigger cursor-pointer justify-start gap-3 rounded-[var(--radius-md)] px-4 text-right"
            >
              <Icon aria-hidden="true" />
              <span>
                <span className="block font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-xs opacity-75">
                  {item.description}
                </span>
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {tabs.map((item) => (
        <TabsContent key={item.value} value={item.value} className="mt-6">
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function CustomersWorkspace({
  initialTab,
  customers,
  exportData,
}: {
  initialTab: "customers" | "export";
  customers: ReactNode;
  exportData: ReactNode;
}) {
  return (
    <ManagementWorkspace
      path="/dashboard/customers"
      initialTab={initialTab}
      tabs={[
        {
          value: "customers",
          label: "قائمة العملاء",
          description: "إدارة بيانات العملاء",
          icon: Users,
          content: customers,
        },
        {
          value: "export",
          label: "تصدير المحادثات",
          description: "سحب سجل واتساب العميل",
          icon: Download,
          content: exportData,
        },
      ]}
    />
  );
}

export function RestaurantWorkspace({
  initialTab,
  settings,
  menu,
}: {
  initialTab: "settings" | "menu";
  settings: ReactNode;
  menu: ReactNode;
}) {
  return (
    <ManagementWorkspace
      path="/dashboard/restaurant"
      initialTab={initialTab}
      tabs={[
        {
          value: "settings",
          label: "بيانات النشاط",
          description: "المعلومات والإعدادات",
          icon: Settings2,
          content: settings,
        },
        {
          value: "menu",
          label: "المنتجات والأسعار",
          description: "إدارة القائمة المتاحة",
          icon: ListTree,
          content: menu,
        },
      ]}
    />
  );
}
