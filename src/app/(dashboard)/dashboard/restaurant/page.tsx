import { redirect } from "next/navigation";
import { RestaurantSettingsForm } from "@/components/dashboard/restaurant-settings-form";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { getLocale, createTranslator } from "@/lib/i18n";

export default async function RestaurantSettingsPage() {
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

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          {t("restaurant.title")}
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          {t("restaurant.subtitle")}
        </p>
      </div>

      <RestaurantSettingsForm restaurant={restaurant} />
    </div>
  );
}
