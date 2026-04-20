import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { CustomersTable } from "@/components/dashboard/customers-table";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) redirect("/onboarding");

  // First-page server fetch so the initial paint has data without waiting on
  // the client query.
  const { data: rows, count } = await adminSupabaseClient
    .from("customers")
    .select(
      "id, phone_number, full_name, source, metadata, opted_out, last_seen_at, created_at, updated_at",
      { count: "exact" }
    )
    .eq("restaurant_id", restaurant.id)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(0, 24);

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Users size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
            العملاء
          </h1>
          <p className="text-sm text-slate-500">
            إدارة قائمة عملاء {restaurant.name} لإرسال رسائل أو إطلاق حملات.
          </p>
        </div>
      </div>

      <CustomersTable
        initialRows={rows ?? []}
        initialTotal={count ?? 0}
        pageSize={25}
      />
    </div>
  );
}
