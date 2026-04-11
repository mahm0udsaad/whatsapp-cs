import { redirect } from "next/navigation";
import { RestaurantSettingsForm } from "@/components/dashboard/restaurant-settings-form";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { createTranslator } from "@/lib/i18n";

export default async function RestaurantSettingsPage() {
  const t = createTranslator("ar");
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
        <h1 className="text-3xl font-bold text-slate-950">
          {t("restaurant.title")}
        </h1>
        <p className="mt-1 text-slate-600">
          {t("restaurant.subtitle")}
        </p>
      </div>

      <RestaurantSettingsForm restaurant={restaurant} />
    </div>
  );
}
