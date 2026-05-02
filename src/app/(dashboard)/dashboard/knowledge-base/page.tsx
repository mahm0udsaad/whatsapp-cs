import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { KnowledgeBaseManager } from "@/components/dashboard/knowledge-base-manager";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { KnowledgeBase } from "@/lib/types";
import { createTranslator } from "@/lib/i18n";

export default async function KnowledgeBasePage() {
  noStore();
  const t = createTranslator("ar");
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const restaurant = await getRestaurantForUserId(user.id);

  if (!restaurant) {
    redirect("/onboarding");
  }

  const { data } = await adminSupabaseClient
    .from("knowledge_base")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">
          {t("knowledgeBase.title")}
        </h1>
        <p className="mt-1 text-slate-600">
          {t("knowledgeBase.subtitle")}
        </p>
      </div>

      <KnowledgeBaseManager
        initialEntries={(data || []) as KnowledgeBase[]}
        websiteUrl={restaurant.website_url}
      />
    </div>
  );
}
