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
    // Members can't provision a restaurant — if theirs is missing/inactive,
    // onboarding (which creates a NEW restaurant) is wrong; send to login.
    redirect(tenant?.isMember ? "/login" : "/onboarding");
  }

  // Onboarding is an owner-only flow. A staff member joins an already-set-up
  // restaurant, so never funnel them back into it on draft/failed status.
  if (
    !tenant.isMember &&
    (tenant.setupStatus === "draft" || tenant.setupStatus === "failed")
  ) {
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
