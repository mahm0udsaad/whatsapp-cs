import { redirect } from "next/navigation";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { OrdersList } from "@/components/dashboard/orders-list";
import type { Order } from "@/lib/types";

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) redirect("/onboarding");

  const { data: orders } = await adminSupabaseClient
    .from("orders")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const pendingCount = (orders || []).filter((o) => o.status === "pending").length;

  return (
    <div className="flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">
            الطلبات والتصعيدات
          </h1>
          <p className="mt-1 text-slate-600">
            طلبات الحجز ورسائل العملاء التي تحتاج متابعة من فريقك.
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex h-9 items-center justify-center rounded-full bg-amber-500 px-4 text-sm font-semibold text-white">
            {pendingCount} بانتظار المتابعة
          </div>
        )}
      </div>

      <OrdersList orders={(orders || []) as Order[]} />
    </div>
  );
}
