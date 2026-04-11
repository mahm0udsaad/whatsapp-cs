import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCurrentUser, getTenantContextForUser } from "@/lib/tenant";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const tenant = await getTenantContextForUser(user.id);

  if (!tenant?.restaurant) {
    redirect("/onboarding");
  }

  if (tenant.setupStatus === "draft" || tenant.setupStatus === "failed") {
    redirect("/onboarding");
  }

  return (
    <DashboardShell
      restaurantName={tenant.restaurant.name}
      restaurantLogo={tenant.restaurant.logo_url}
      userName={tenant.profile.full_name}
      userEmail={tenant.profile.email}
      locale="ar"
    >
      {children}
    </DashboardShell>
  );
}
