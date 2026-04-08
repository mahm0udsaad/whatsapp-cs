import { redirect } from "next/navigation";
import { ConversationsInbox } from "@/components/dashboard/conversations-inbox";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { Conversation } from "@/lib/types";

export default async function ConversationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const restaurant = await getRestaurantForUserId(user.id);

  if (!restaurant) {
    redirect("/onboarding");
  }

  const { data } = await adminSupabaseClient
    .from("conversations")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("last_message_at", { ascending: false })
    .limit(50);

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
          Conversations
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Review live customer threads for your restaurant only.
        </p>
      </div>

      <ConversationsInbox
        restaurantId={restaurant.id}
        initialConversations={(data || []) as Conversation[]}
      />
    </div>
  );
}
