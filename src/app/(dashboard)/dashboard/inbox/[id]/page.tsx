import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { InboxInspector } from "@/components/dashboard/inbox-inspector";
import type { Message } from "@/lib/types";

export const dynamic = "force-dynamic";

interface InspectorPageProps {
  params: Promise<{ id: string }>;
}

// Kiara default Rekaz tenant slug — used when an order doesn't carry a direct
// rekaz_booking_url yet.
const KIARA_REKAZ_SLUG = "kyara-sba-1";

export default async function InspectorPage({ params }: InspectorPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) redirect("/onboarding");

  const { data: order } = await adminSupabaseClient
    .from("orders")
    .select("*, assignee:team_members!orders_assigned_to_fkey(id, full_name, user_id)")
    .eq("id", id)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!order) {
    notFound();
  }

  // Verify caller is a member of this tenant (owner OR active team_member).
  const { data: member } = await adminSupabaseClient
    .from("team_members")
    .select("id, role, full_name")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .maybeSingle();

  const isOwner = restaurant.owner_id === user.id;
  if (!isOwner && !member) {
    redirect("/dashboard/inbox");
  }

  const { data: messages } = await adminSupabaseClient
    .from("messages")
    .select("*")
    .eq("conversation_id", order.conversation_id)
    .order("created_at", { ascending: true })
    .limit(200);

  const { data: conversation } = await adminSupabaseClient
    .from("conversations")
    .select("id, customer_phone, customer_name, last_message_at")
    .eq("id", order.conversation_id)
    .maybeSingle();

  const { data: instructions } = await adminSupabaseClient
    .from("agent_instructions")
    .select("id, title, body, tags, version, created_at")
    .eq("restaurant_id", restaurant.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(3);

  const rekazFallbackUrl =
    order.rekaz_booking_url ||
    `https://platform.rekaz.io/reservation/${KIARA_REKAZ_SLUG}`;

  const canSend =
    isOwner ||
    (member && order.assigned_to && order.assigned_to === member.id);

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8" dir="rtl">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/dashboard/inbox"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowRight size={16} />
          العودة إلى الصندوق
        </Link>
      </div>

      <InboxInspector
        order={order}
        conversation={conversation || null}
        initialMessages={(messages || []) as Message[]}
        instructions={instructions || []}
        rekazBookingUrl={rekazFallbackUrl}
        currentMemberId={member?.id ?? null}
        currentMemberRole={member?.role ?? null}
        isOwner={isOwner}
        canSend={Boolean(canSend)}
      />
    </div>
  );
}
