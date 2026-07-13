import { redirect } from "next/navigation";
import { RestaurantSettingsForm } from "@/components/dashboard/restaurant-settings-form";
import { MenuManager } from "@/components/dashboard/menu-manager";
import { RestaurantWorkspace } from "@/components/dashboard/management-workspaces";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { createTranslator } from "@/lib/i18n";
import type { MenuItem } from "@/lib/types";

export default async function RestaurantSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const t = createTranslator("ar");
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const restaurant = await getRestaurantForUserId(user.id);

  if (!restaurant) {
    redirect("/onboarding");
  }

  const { data: menuItems } = await adminSupabaseClient
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("updated_at", { ascending: false });
  const initialTab = (await searchParams).tab === "menu" ? "menu" : "settings";

  return (
    <div className="dashboard-page space-y-6">
      <div className="dashboard-hero px-6 py-7 text-white sm:px-8">
        <div className="absolute inset-y-0 start-0 w-2 bg-[#ffc400]" aria-hidden="true" />
        <h1 className="text-3xl font-bold text-white">
          {t("restaurant.title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/75 sm:text-base">
          بيانات النشاط والمنتجات والأسعار في مكان واحد.
        </p>
      </div>

      <RestaurantWorkspace
        initialTab={initialTab}
        settings={<RestaurantSettingsForm restaurant={restaurant} />}
        menu={
          <MenuManager
            restaurant={restaurant}
            initialItems={(menuItems ?? []) as MenuItem[]}
          />
        }
      />
    </div>
  );
}
