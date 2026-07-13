import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { CustomersTable } from "@/components/dashboard/customers-table";
import { ExportClientData } from "@/components/dashboard/export-client-data";
import { CustomersWorkspace } from "@/components/dashboard/management-workspaces";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
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

  const initialTab = (await searchParams).tab === "export" ? "export" : "customers";

  return (
    <div className="dashboard-page space-y-6">
      <div className="dashboard-hero px-6 py-7 text-white sm:px-8">
        <div className="absolute inset-y-0 start-0 w-2 bg-[#ffc400]" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <Users size={24} aria-hidden="true" />
          <h1 className="text-3xl font-bold">العملاء</h1>
        </div>
        <p className="mt-2 text-sm leading-6 text-white/75 sm:text-base">
          إدارة عملاء {restaurant.name} وتصدير سجل محادثاتهم من مكان واحد.
        </p>
      </div>

      <CustomersWorkspace
        initialTab={initialTab}
        customers={
          <CustomersTable
            initialRows={rows ?? []}
            initialTotal={count ?? 0}
            pageSize={25}
          />
        }
        exportData={
          <div className="max-w-2xl">
            <ExportClientData />
          </div>
        }
      />
    </div>
  );
}
