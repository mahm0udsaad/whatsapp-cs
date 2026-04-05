"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex h-full">
      <Sidebar
        restaurantName="Delicious Bistro"
        restaurantLogo={undefined}
        userName="John Doe"
        userEmail="john@restaurant.com"
        onLogout={handleLogout}
      />

      <main className="flex-1 lg:ml-64 overflow-auto">
        <div className="min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
