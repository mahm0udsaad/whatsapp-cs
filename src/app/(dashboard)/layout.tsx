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

  // Owner-only surfaces (AI Manager) rely on this flag.
  const isOwner =
    tenant.restaurant.owner_id === user.id ||
    Boolean((tenant.profile as { is_super_admin?: boolean }).is_super_admin);

  return (
    <DashboardShell
      restaurantName={tenant.restaurant.name}
      restaurantLogo={tenant.restaurant.logo_url}
      restaurantId={tenant.restaurant.id}
      isOwner={isOwner}
      userName={tenant.profile.full_name}
      userEmail={tenant.profile.email}
      locale="ar"
    >
      {children}
    </DashboardShell>
  );
}
