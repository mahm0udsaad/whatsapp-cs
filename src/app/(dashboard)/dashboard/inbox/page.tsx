import { redirect } from "next/navigation";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { ConversationsInboxShell } from "@/components/dashboard/conversations-inbox-shell";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) redirect("/onboarding");

  const { data: member } = await adminSupabaseClient
    .from("team_members")
    .select("id, role, is_active")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .maybeSingle();

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">صندوق المحادثات</h1>
        <p className="mt-1 text-slate-600">
          رسائل العملاء الواردة. استلمي المحادثة للرد يدوياً أو وكّلي البوت للرد نيابة عنك.
        </p>
      </div>

      <ConversationsInboxShell
        restaurantId={restaurant.id}
        currentMemberId={member?.id ?? null}
      />
    </div>
  );
}
