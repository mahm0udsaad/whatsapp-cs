import { redirect } from "next/navigation";
import { RestaurantSettingsForm } from "@/components/dashboard/restaurant-settings-form";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";

export default async function RestaurantSettingsPage() {
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
          Restaurant Settings
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Manage the business identity and source data used by your tenant.
        </p>
      </div>

      <RestaurantSettingsForm restaurant={restaurant} />
    </div>
  );
}
