/**
 * Push notification for Meta template-approval decisions.
 *
 * Fired from the approval poller the moment a template transitions into a
 * terminal status (approved / rejected / paused / disabled). Targets every
 * active manager (team_members.role='admin') for the tenant so owners get a
 * signal without us tracking who created the template.
 */

import { adminSupabaseClient } from "@/lib/supabase/admin";
import { sendExpoPush, type ExpoPushMessage } from "@/lib/expo-push";

const PUSH_CHANNEL = "templates";

async function fetchManagerPushTokens(restaurantId: string): Promise<string[]> {
  const { data: members, error } = await adminSupabaseClient
    .from("team_members")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .eq("role", "admin");
  if (error || !members?.length) return [];

  const ids = members.map((m) => m.id);
  const { data: tokens } = await adminSupabaseClient
    .from("user_push_tokens")
    .select("expo_token")
    .in("team_member_id", ids)
    .eq("disabled", false);
  return (tokens ?? []).map((t) => t.expo_token as string);
}

async function disableInvalidTokens(tokens: string[]) {
  if (tokens.length === 0) return;
  await adminSupabaseClient
    .from("user_push_tokens")
    .update({ disabled: true })
    .in("expo_token", tokens);
}

export interface TemplateDecisionNotification {
  restaurantId: string;
  templateId: string;
  templateName: string;
  status: "approved" | "rejected" | "paused" | "disabled";
  rejectionReason?: string | null;
}

export async function notifyManagersOfTemplateDecision(
  input: TemplateDecisionNotification
): Promise<void> {
  try {
    const tokens = await fetchManagerPushTokens(input.restaurantId);
    if (tokens.length === 0) return;

    const title =
      input.status === "approved"
        ? `القالب "${input.templateName}" تم اعتماده ✅`
        : input.status === "rejected"
          ? `القالب "${input.templateName}" مرفوض ❌`
          : `تغيّرت حالة القالب "${input.templateName}"`;

    const body =
      input.status === "approved"
        ? "أصبح بالإمكان إنشاء حملة تستخدم هذا القالب."
        : input.status === "rejected"
          ? input.rejectionReason?.slice(0, 140) ||
            "تم رفض القالب من واتساب. يمكن التعديل وإعادة الإرسال."
          : `الحالة الجديدة: ${input.status}.`;

    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t,
      title,
      body,
      data: {
        type: "template_decision",
        templateId: input.templateId,
        restaurantId: input.restaurantId,
        status: input.status,
      },
      priority: "high",
      channelId: PUSH_CHANNEL,
      sound: "default",
    }));

    const result = await sendExpoPush(messages);
    if (result.invalidTokens.length > 0) {
      await disableInvalidTokens(result.invalidTokens);
    }
  } catch (err) {
    console.error("[template-notifications] failed:", err);
  }
}
