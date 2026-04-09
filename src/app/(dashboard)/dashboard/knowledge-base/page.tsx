import { redirect } from "next/navigation";
import { KnowledgeBaseManager } from "@/components/dashboard/knowledge-base-manager";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { KnowledgeBase } from "@/lib/types";
import { getLocale, createTranslator } from "@/lib/i18n";

export default async function KnowledgeBasePage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
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
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          {t("knowledgeBase.title")}
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          {t("knowledgeBase.subtitle")}
        </p>
      </div>

      <KnowledgeBaseManager initialEntries={(data || []) as KnowledgeBase[]} />
    </div>
  );
}
