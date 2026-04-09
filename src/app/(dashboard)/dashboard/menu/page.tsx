import { redirect } from "next/navigation";
import { MenuManager } from "@/components/dashboard/menu-manager";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { MenuItem } from "@/lib/types";
import { getLocale, createTranslator } from "@/lib/i18n";

export default async function MenuPage() {
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
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          {t("menu.title")}
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          {t("menu.subtitle")}
        </p>
      </div>

      <MenuManager
        restaurant={restaurant}
        initialItems={(data || []) as MenuItem[]}
      />
    </div>
  );
}
