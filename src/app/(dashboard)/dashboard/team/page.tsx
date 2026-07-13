import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  getCurrentSessionContext,
  getOwnerRestaurantForUserId,
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
      <div className="dashboard-page space-y-6">
        <Card>
          <CardHeader>
            <CardDescription>{t("team.title")}</CardDescription>
            <CardTitle>{t("team.ownerOnly")}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Owner-only surface. A staff member's auth user owns no restaurant, so
  // `getOwnerRestaurantForUserId` returns null — bounce them to the dashboard
  // (NOT onboarding, which would try to create a brand-new restaurant).
  const restaurant = await getOwnerRestaurantForUserId(session.ownerId);
  if (!restaurant) {
    redirect("/dashboard");
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
    <div className="dashboard-page space-y-6" dir="rtl">
      <div className="dashboard-page-header">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#20339a]">إدارة الفريق</p>
          <h1>{t("team.title")}</h1>
          <p>{t("team.subtitle")}</p>
        </div>
        <Link
          href="/dashboard/team/performance"
          className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--brand-strong)] shadow-sm transition-colors hover:bg-[var(--brand-soft)]"
        >
          <BarChart3 className="h-4 w-4" /> أداء الفريق
        </Link>
      </div>

      <TeamMembersManager initialMembers={teamMembers} />

      <TeamManager initialMembers={legacyMembers} />
    </div>
  );
}
