import { redirect } from "next/navigation";
import {
  getCurrentSessionContext,
  getOwnerRestaurantForUserId,
} from "@/lib/tenant";
import { TeamPerformanceDashboard } from "@/components/dashboard/team-performance-dashboard";

export const dynamic = "force-dynamic";

export default async function TeamPerformancePage() {
  const session = await getCurrentSessionContext();
  if (!session) redirect("/login");

  // Gating is identical to /dashboard/team — only the tenant owner can see this
  // surface. Legacy members carry a memberId; staff `team_members` auth users
  // own no restaurant, so the owner-restaurant lookup returns null for them.
  if (session.memberId) {
    redirect("/dashboard/team");
  }
  const restaurant = await getOwnerRestaurantForUserId(session.ownerId);
  if (!restaurant) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-6" dir="rtl">
      <TeamPerformanceDashboard />
    </div>
  );
}
