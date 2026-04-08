import { redirect } from "next/navigation";
import { AIAgentSettingsForm } from "@/components/dashboard/ai-agent-settings-form";
import {
  getActiveAgentForRestaurant,
  getCurrentUser,
  getRestaurantForUserId,
} from "@/lib/tenant";

export default async function AIAgentPage() {
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          AI Agent Configuration
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Configure the live assistant that responds on your restaurant&apos;s
          WhatsApp number.
        </p>
      </div>

      <AIAgentSettingsForm aiAgent={aiAgent} />
    </div>
  );
}
