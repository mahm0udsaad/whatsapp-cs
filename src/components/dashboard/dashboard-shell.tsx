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
  locale?: "ar" | "en";
}

export function DashboardShell({
  children,
  restaurantName,
  restaurantLogo,
  userName,
  userEmail,
  locale = "ar",
}: DashboardShellProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-transparent" dir="rtl" lang={locale}>
      <Sidebar
        restaurantName={restaurantName}
        restaurantLogo={restaurantLogo ?? undefined}
        userName={userName ?? undefined}
        userEmail={userEmail ?? undefined}
        onLogout={handleLogout}
        locale={locale}
        showLanguageSwitcher={false}
      />

      <main className="relative flex-1 overflow-x-hidden lg:ms-72">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,138,95,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(15,138,95,0.08),transparent_32%)]" />
        <div className="relative min-h-screen">{children}</div>
      </main>
    </div>
  );
}
