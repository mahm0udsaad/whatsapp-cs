import { redirect } from "next/navigation";
import { Bot, BookOpen, ShieldCheck } from "lucide-react";
import { AIAgentSettingsForm } from "@/components/dashboard/ai-agent-settings-form";
import { AiAgentWorkspace, type AiAgentWorkspaceTab } from "@/components/dashboard/ai-agent-workspace";
import { AiManagerChat } from "@/components/dashboard/ai-manager-chat";
import { KnowledgeBaseManager } from "@/components/dashboard/knowledge-base-manager";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getOwnerContext } from "@/lib/ai-manager-auth";
import {
  getActiveAgentForRestaurant,
  getCurrentUser,
  getRestaurantForUserId,
} from "@/lib/tenant";
import { createTranslator } from "@/lib/i18n";
import type { KnowledgeBase } from "@/lib/types";

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

export default async function AIAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const t = createTranslator("ar");
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const restaurant = await getRestaurantForUserId(user.id);

  if (!restaurant) {
    redirect("/onboarding");
  }

  const [aiAgent, knowledgeRes, owner] = await Promise.all([
    getActiveAgentForRestaurant(restaurant.id),
    adminSupabaseClient
      .from("knowledge_base")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("updated_at", { ascending: false }),
    getOwnerContext(),
  ]);

  if (!aiAgent) {
    redirect("/onboarding");
  }

  const canManageTraining = owner?.restaurantId === restaurant.id;
  const managerData = canManageTraining
    ? await Promise.all([
        adminSupabaseClient
          .from("owner_ai_manager_threads")
          .select("id, title, status, last_message_at, created_at, owner_user_id")
          .eq("restaurant_id", restaurant.id)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(100),
        adminSupabaseClient
          .from("agent_instructions")
          .select("id, version, title, body, tags, status, authored_via, source_thread_id, created_at")
          .eq("restaurant_id", restaurant.id)
          .order("version", { ascending: false })
          .limit(200),
      ])
    : null;

  const requestedTab = (await searchParams).tab;
  const allowedTabs = canManageTraining
    ? new Set(["settings", "training", "knowledge"])
    : new Set(["settings", "knowledge"]);
  const initialTab: AiAgentWorkspaceTab = allowedTabs.has(requestedTab ?? "")
    ? (requestedTab as AiAgentWorkspaceTab)
    : "settings";
  const threads = (((managerData?.[0].data ?? []) as ThreadRow[])).filter(
    (thread) => owner?.isSuperAdmin || thread.owner_user_id === owner?.userId
  );
  const instructions = (managerData?.[1].data ?? []) as InstructionRow[];
  const activeInstructions = instructions.filter((instruction) => instruction.status === "active").length;
  const knowledgeEntries = (knowledgeRes.data ?? []) as KnowledgeBase[];
  const businessName = restaurant.name_ar ?? restaurant.name;

  return (
    <div className="dashboard-page space-y-7" dir="rtl">
      <div className="dashboard-page-header">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand)]">الذكاء الاصطناعي</p>
          <h1>{t("aiAgent.title")}</h1>
          <p>اضبطي هوية المساعد، قواعد الرد، والمعلومات التي يعتمد عليها في مساحة عمل واحدة.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800"><ShieldCheck size={15} /> المساعد نشط</span>
          <span className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--line)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--foreground)]"><BookOpen size={15} className="text-[var(--brand)]" /> {knowledgeEntries.length} مصدر معرفة</span>
          {canManageTraining ? <span className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--line)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--foreground)]"><Bot size={15} className="text-[var(--brand)]" /> {activeInstructions} قاعدة نشطة</span> : null}
        </div>
      </div>

      <AiAgentWorkspace
        initialTab={initialTab}
        canManageTraining={canManageTraining}
        settings={
          <AIAgentSettingsForm aiAgent={aiAgent} businessName={restaurant.name} />
        }
        training={
          <AiManagerChat
            initialThreads={threads}
            initialInstructions={instructions}
            businessName={businessName}
          />
        }
        knowledge={
          <KnowledgeBaseManager
            initialEntries={knowledgeEntries}
            websiteUrl={restaurant.website_url}
          />
        }
      />
    </div>
  );
}
