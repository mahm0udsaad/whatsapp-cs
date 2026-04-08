"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";

interface DashboardShellProps {
  children: ReactNode;
  restaurantName: string;
  restaurantLogo?: string | null;
  userName?: string | null;
  userEmail?: string | null;
}

export function DashboardShell({
  children,
  restaurantName,
  restaurantLogo,
  userName,
  userEmail,
}: DashboardShellProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex h-full">
      <Sidebar
        restaurantName={restaurantName}
        restaurantLogo={restaurantLogo ?? undefined}
        userName={userName ?? undefined}
        userEmail={userEmail ?? undefined}
        onLogout={handleLogout}
      />

      <main className="flex-1 overflow-auto lg:ml-64">
        <div className="min-h-full">{children}</div>
      </main>
    </div>
  );
}
