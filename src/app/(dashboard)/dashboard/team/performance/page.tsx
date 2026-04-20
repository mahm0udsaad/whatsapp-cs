import { redirect } from "next/navigation";
import { getCurrentSessionContext } from "@/lib/tenant";
import { TeamPerformanceDashboard } from "@/components/dashboard/team-performance-dashboard";

export const dynamic = "force-dynamic";

export default async function TeamPerformancePage() {
  const session = await getCurrentSessionContext();
  if (!session) redirect("/login");

  // Gating is identical to /dashboard/team — only the tenant owner (no
  // memberId) can see this surface. RLS still locks everything regardless.
  if (session.memberId) {
    redirect("/dashboard/team");
  }

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8" dir="rtl">
      <TeamPerformanceDashboard />
    </div>
  );
}
