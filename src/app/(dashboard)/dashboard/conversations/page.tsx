import { redirect } from "next/navigation";
import { CircleAlert, MessagesSquare } from "lucide-react";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { ConversationsInboxShell } from "@/components/dashboard/conversations-inbox-shell";
import {
  InboxWorkspace,
  type InboxWorkspaceTab,
} from "@/components/dashboard/inbox-workspace";
import { OrdersList } from "@/components/dashboard/orders-list";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) redirect("/onboarding");

  const [memberRes, ordersRes] = await Promise.all([
    adminSupabaseClient
      .from("team_members")
      .select("id, role, is_active")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .maybeSingle(),
    adminSupabaseClient
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const orders = (ordersRes.data ?? []) as Order[];
  const pendingRequests = orders.filter((order) => order.status === "pending").length;
  const requestedTab = (await searchParams).tab;
  const initialTab: InboxWorkspaceTab =
    requestedTab === "requests" ? "requests" : "conversations";

  return (
    <div className="dashboard-page space-y-6" dir="rtl">
      <div className="dashboard-page-header">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand)]">مركز خدمة العملاء</p>
          <h1>المحادثات والطلبات</h1>
          <p>تابعي رسائل العملاء، استلمي المحادثات، وعالجي الحجوزات والتصعيدات من مساحة عمل واحدة.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--line)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--foreground)]">
            <MessagesSquare size={15} className="text-[var(--brand)]" /> مباشر الآن
          </span>
          {pendingRequests > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800">
              <CircleAlert size={15} /> {pendingRequests} تحتاج إجراء
            </span>
          ) : null}
        </div>
      </div>

      <InboxWorkspace
        initialTab={initialTab}
        pendingRequests={pendingRequests}
        conversations={
          <ConversationsInboxShell
            restaurantId={restaurant.id}
            currentMemberId={memberRes.data?.id ?? null}
            canAnalyze={
              restaurant.owner_id === user.id || memberRes.data?.role === "admin"
            }
          />
        }
        requests={<OrdersList orders={orders} />}
      />
    </div>
  );
}
