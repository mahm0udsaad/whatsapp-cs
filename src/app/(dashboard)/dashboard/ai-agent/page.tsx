import { redirect } from "next/navigation";
import { AIAgentSettingsForm } from "@/components/dashboard/ai-agent-settings-form";
import {
  getActiveAgentForRestaurant,
  getCurrentUser,
  getRestaurantForUserId,
} from "@/lib/tenant";
import { createTranslator } from "@/lib/i18n";

export default async function AIAgentPage() {
  const t = createTranslator("ar");
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const restaurant = await getRestaurantForUserId(user.id);

  if (!restaurant) {
    redirect("/onboarding");
  }

  const aiAgent = await getActiveAgentForRestaurant(restaurant.id);

  if (!aiAgent) {
    redirect("/onboarding");
  }

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">
          {t("aiAgent.title")}
        </h1>
        <p className="mt-1 text-slate-600">
          {t("aiAgent.subtitle")}
        </p>
      </div>

      <AIAgentSettingsForm aiAgent={aiAgent} businessName={restaurant.name} />
    </div>
  );
}
