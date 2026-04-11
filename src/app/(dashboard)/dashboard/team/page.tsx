import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  getCurrentSessionContext,
  getRestaurantForUserId,
} from "@/lib/tenant";
import { getLocale, createTranslator } from "@/lib/i18n";
import { TeamManager } from "@/components/dashboard/team-manager";

export default async function TeamPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);

  const session = await getCurrentSessionContext();
  if (!session) {
    redirect("/login");
  }

  if (session.memberId) {
    return (
      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
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

  const { data: members } = await adminSupabaseClient
    .from("restaurant_members")
    .select("id, username, full_name, last_login_at, created_at")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardDescription>{t("team.title")}</CardDescription>
          <CardTitle>{t("team.subtitle")}</CardTitle>
        </CardHeader>
      </Card>

      <TeamManager initialMembers={members ?? []} />
    </div>
  );
}
