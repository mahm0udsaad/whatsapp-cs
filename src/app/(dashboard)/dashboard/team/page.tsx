import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  getCurrentSessionContext,
  getRestaurantForUserId,
} from "@/lib/tenant";
import { getLocale, createTranslator } from "@/lib/i18n";
import { TeamManager } from "@/components/dashboard/team-manager";
import { TeamMembersManager } from "@/components/dashboard/team-members-manager";

export const dynamic = "force-dynamic";

interface AuthUserLookup {
  email: string | null;
}

export default async function TeamPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);

  const session = await getCurrentSessionContext();
  if (!session) {
    redirect("/login");
  }

  if (session.memberId) {
    return (
      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-6">
        <Card>
          <CardHeader>
            <CardDescription>{t("team.title")}</CardDescription>
            <CardTitle>{t("team.ownerOnly")}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const restaurant = await getRestaurantForUserId(session.ownerId);
  if (!restaurant) {
    redirect("/onboarding");
  }

  const [legacyRes, teamRes] = await Promise.all([
    adminSupabaseClient
      .from("restaurant_members")
      .select("id, username, full_name, last_login_at, created_at")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false }),
    adminSupabaseClient
      .from("team_members")
      .select(
        "id, user_id, full_name, role, is_active, is_available, created_at, updated_at"
      )
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false }),
  ]);

  const legacyMembers = legacyRes.data ?? [];
  const teamMembersRows = teamRes.data ?? [];

  // Best-effort enrichment: load each team member's email from auth.users so
  // the owner sees who they invited. Failures are silent.
  const emailByUserId = new Map<string, string>();
  for (const row of teamMembersRows) {
    if (!row.user_id) continue;
    try {
      const { data: u } = await adminSupabaseClient.auth.admin.getUserById(
        row.user_id
      );
      const lookup = (u?.user ?? null) as AuthUserLookup | null;
      if (lookup?.email) emailByUserId.set(row.user_id, lookup.email);
    } catch {
      /* ignore */
    }
  }

  const teamMembers = teamMembersRows.map((row) => ({
    ...row,
    email: row.user_id ? emailByUserId.get(row.user_id) ?? null : null,
  }));

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-6" dir="rtl">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardDescription>{t("team.title")}</CardDescription>
            <CardTitle>{t("team.subtitle")}</CardTitle>
          </div>
          <Link
            href="/dashboard/team/performance"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <BarChart3 className="h-4 w-4" /> أداء الفريق
          </Link>
        </CardHeader>
      </Card>

      <TeamMembersManager initialMembers={teamMembers} />

      <TeamManager initialMembers={legacyMembers} />
    </div>
  );
}
