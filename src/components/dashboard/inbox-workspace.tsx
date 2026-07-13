"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, MessagesSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type InboxWorkspaceTab = "conversations" | "requests";

interface InboxWorkspaceProps {
  initialTab: InboxWorkspaceTab;
  pendingRequests: number;
  conversations: ReactNode;
  requests: ReactNode;
}

export function InboxWorkspace({
  initialTab,
  pendingRequests,
  conversations,
  requests,
}: InboxWorkspaceProps) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);

  const changeTab = (value: string) => {
    const nextTab = value as InboxWorkspaceTab;
    setTab(nextTab);
    router.replace(`/dashboard/conversations?tab=${nextTab}`, { scroll: false });
  };

  return (
    <Tabs value={tab} onValueChange={changeTab} dir="rtl">
      <TabsList className="dashboard-tabs grid h-auto w-full max-w-2xl grid-cols-2 gap-2 rounded-[var(--radius-lg)] p-2">
        <TabsTrigger
          value="conversations"
          className="dashboard-tab-trigger cursor-pointer gap-3 rounded-[var(--radius-md)] px-4"
        >
          <MessagesSquare aria-hidden="true" />
          <span className="font-semibold">المحادثات</span>
        </TabsTrigger>
        <TabsTrigger
          value="requests"
          className="dashboard-tab-trigger cursor-pointer gap-3 rounded-[var(--radius-md)] px-4"
        >
          <CalendarCheck aria-hidden="true" />
          <span className="font-semibold">الطلبات والمتابعة</span>
          {pendingRequests > 0 ? (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[#ffc400] px-1.5 py-0.5 text-xs font-bold text-[#172777]">
              {pendingRequests > 99 ? "99+" : pendingRequests}
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="conversations" className="mt-6">
        {conversations}
      </TabsContent>
      <TabsContent value="requests" className="mt-6">
        {requests}
      </TabsContent>
    </Tabs>
  );
}
