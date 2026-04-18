/**
 * Broadcast push notifications to employees when a new inbound conversation
 * arrives and nobody has claimed it yet.
 *
 * Strategy:
 *   1. Ask `current_on_duty_agents` for the team members whose shifts cover now().
 *   2. If nobody is on shift, fall back to ALL active team members for the tenant
 *      (per product spec).
 *   3. Fetch their Expo push tokens from `user_push_tokens` (disabled=false).
 *   4. Send via sendExpoPush.
 *   5. For tokens Expo reports as DeviceNotRegistered, mark disabled=true so we
 *      stop sending to them.
 *
 * This function is fire-and-forget from the webhook — caller should not block
 * the Twilio response waiting for Expo.
 */

import { adminSupabaseClient } from "@/lib/supabase/admin";
import { sendExpoPush, type ExpoPushMessage } from "@/lib/expo-push";

const PUSH_CHANNEL = "escalations";
const PREVIEW_MAX_LEN = 140;

function truncate(text: string, max: number): string {
  const clean = (text || "").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "…";
}

async function fetchOnShiftTeamMemberIds(restaurantId: string): Promise<string[]> {
  const { data, error } = await adminSupabaseClient.rpc("current_on_duty_agents", {
    p_restaurant_id: restaurantId,
  });
  if (error) {
    console.error("[conversation-notifications] current_on_duty_agents failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{ team_member_id: string; is_available: boolean | null }>;
  // Only notify available (not in DND) on-shift agents.
  return rows.filter((r) => r.is_available !== false).map((r) => r.team_member_id);
}

async function fetchAllActiveTeamMemberIds(restaurantId: string): Promise<string[]> {
  const { data, error } = await adminSupabaseClient
    .from("team_members")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);
  if (error) {
    console.error("[conversation-notifications] team_members fallback failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.id as string);
}

async function fetchPushTokens(teamMemberIds: string[]): Promise<
  Array<{ team_member_id: string; expo_token: string; id: string }>
> {
  if (teamMemberIds.length === 0) return [];
  const { data, error } = await adminSupabaseClient
    .from("user_push_tokens")
    .select("id, team_member_id, expo_token")
    .in("team_member_id", teamMemberIds)
    .eq("disabled", false);
  if (error) {
    console.error("[conversation-notifications] user_push_tokens read failed:", error.message);
    return [];
  }
  return (data ?? []) as Array<{ id: string; team_member_id: string; expo_token: string }>;
}

async function disableInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await adminSupabaseClient
    .from("user_push_tokens")
    .update({ disabled: true })
    .in("expo_token", tokens);
  if (error) {
    console.error("[conversation-notifications] failed to disable tokens:", error.message);
  }
}

export interface NewConversationPreview {
  customerName?: string | null;
  customerPhone: string;
  body: string;
}

export async function notifyAgentsOfNewConversation(
  restaurantId: string,
  conversationId: string,
  preview: NewConversationPreview
): Promise<void> {
  try {
    let memberIds = await fetchOnShiftTeamMemberIds(restaurantId);
    let usedFallback = false;
    if (memberIds.length === 0) {
      memberIds = await fetchAllActiveTeamMemberIds(restaurantId);
      usedFallback = true;
    }
    if (memberIds.length === 0) {
      console.warn(
        `[conversation-notifications] no recipients for restaurant ${restaurantId}`
      );
      return;
    }

    const tokens = await fetchPushTokens(memberIds);
    if (tokens.length === 0) {
      console.warn(
        `[conversation-notifications] no push tokens for ${memberIds.length} members (fallback=${usedFallback})`
      );
      return;
    }

    const title = preview.customerName
      ? `${preview.customerName} — ${preview.customerPhone}`
      : preview.customerPhone;

    const body = truncate(preview.body || "رسالة جديدة", PREVIEW_MAX_LEN);

    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.expo_token,
      title,
      body,
      data: {
        type: "new_conversation",
        conversationId,
        restaurantId,
      },
      priority: "high",
      channelId: PUSH_CHANNEL,
      sound: "default",
    }));

    const result = await sendExpoPush(messages);

    if (result.invalidTokens.length > 0) {
      await disableInvalidTokens(result.invalidTokens);
    }

    if (result.errors.length > 0) {
      console.warn(
        `[conversation-notifications] conv=${conversationId} sent=${result.sent} skipped=${result.skipped} errors=${result.errors.length}`
      );
    }
  } catch (err) {
    console.error("[conversation-notifications] unexpected error:", err);
  }
}

/**
 * Push only to managers (team_members.role = 'admin' AND is_active).
 * Used by the SLA-breach cron so alerts don't spam every agent.
 */
async function fetchManagerTeamMemberIds(
  restaurantId: string
): Promise<string[]> {
  const { data, error } = await adminSupabaseClient
    .from("team_members")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .eq("role", "admin");
  if (error) {
    console.error(
      "[conversation-notifications] manager lookup failed:",
      error.message
    );
    return [];
  }
  return (data ?? []).map((r) => r.id as string);
}

export async function notifyManagersOfSlaBreach(
  restaurantId: string,
  conversationId: string,
  preview: NewConversationPreview
): Promise<void> {
  try {
    const memberIds = await fetchManagerTeamMemberIds(restaurantId);
    if (memberIds.length === 0) return;

    const tokens = await fetchPushTokens(memberIds);
    if (tokens.length === 0) return;

    const title = "محادثة بدون رد";
    const body = truncate(
      preview.customerName
        ? `${preview.customerName} — ${truncate(preview.body, 80)}`
        : truncate(preview.body, 120),
      PREVIEW_MAX_LEN
    );

    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.expo_token,
      title,
      body,
      data: {
        type: "sla_breach",
        conversationId,
        restaurantId,
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
    console.error("[sla-breach] unexpected error:", err);
  }
}
