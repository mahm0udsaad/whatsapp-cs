import { notFound } from "next/navigation";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getOwnerContext } from "@/lib/ai-manager-auth";
import { AiManagerChat } from "@/components/dashboard/ai-manager-chat";

export const dynamic = "force-dynamic";

interface ThreadRow {
  id: string;
  title: string | null;
  status: string;
  last_message_at: string | null;
  created_at: string;
  owner_user_id: string;
}

interface InstructionRow {
  id: string;
  version: number;
  title: string;
  body: string;
  tags: string[] | null;
  status: string;
  authored_via: string;
  source_thread_id: string | null;
  created_at: string;
}

export default async function AiManagerPage() {
  const owner = await getOwnerContext();
  if (!owner) {
    notFound();
  }

  const [threadsRes, instructionsRes, restaurantRes] = await Promise.all([
    adminSupabaseClient
      .from("owner_ai_manager_threads")
      .select(
        "id, title, status, last_message_at, created_at, owner_user_id"
      )
      .eq("restaurant_id", owner.restaurantId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100),
    adminSupabaseClient
      .from("agent_instructions")
      .select(
        "id, version, title, body, tags, status, authored_via, source_thread_id, created_at"
      )
      .eq("restaurant_id", owner.restaurantId)
      .order("version", { ascending: false })
      .limit(200),
    adminSupabaseClient
      .from("restaurants")
      .select("name, name_ar")
      .eq("id", owner.restaurantId)
      .maybeSingle(),
  ]);

  const threads = ((threadsRes.data ?? []) as ThreadRow[]).filter(
    (t) => owner.isSuperAdmin || t.owner_user_id === owner.userId
  );
  const instructions = (instructionsRes.data ?? []) as InstructionRow[];
  const restaurant = restaurantRes.data as
    | { name: string; name_ar: string | null }
    | null;
  const businessName = restaurant?.name_ar ?? restaurant?.name ?? "النشاط";

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-6">
      <div className="mb-5">
        <h1 className="text-3xl font-bold text-slate-950">مدرب الذكاء</h1>
        <p className="mt-1 text-slate-600">
          علّمي موظفة الذكاء كيف ترد على زبوناتك — كل قاعدة تصدرينها تطبق
          فوراً على المحادثات الجديدة.
        </p>
      </div>
      <AiManagerChat
        initialThreads={threads}
        initialInstructions={instructions}
        businessName={businessName}
      />
    </div>
  );
}
