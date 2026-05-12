/**
 * POST /api/auth/delete-account
 *
 * Permanently delete the calling user's account.
 *
 * Required by Apple App Store guideline 5.1.1(v): any app that lets users
 * create an account must let them delete it from inside the app. The reviewer
 * will tap "Delete Account" in the iOS build and expect the auth user to
 * actually be gone afterwards — soft-delete or "deactivate" doesn't satisfy
 * this guideline, so we hard-delete the auth.users row and let Postgres FK
 * cascade rules clean up the dependent data.
 *
 * Auth: Supabase session (cookie or Bearer). Mobile clients pass a Bearer
 * access token via `apiFetch`; the dashboard sends cookies — both flow
 * through `createServerSupabaseClient()`.
 *
 * Behavior:
 *   1. Resolve the calling user from the access token. 401 if missing.
 *   2. Best-effort cleanup of explicit user-tied rows we know about
 *      (team_members.user_id). The auth.users delete also cascades, but we
 *      do this first so a partial failure still removes the user from
 *      tenants they were a member of.
 *   3. `auth.admin.deleteUser(userId)` — this hard-deletes from auth.users,
 *      which cascades to public.profiles (and through it to provisioning_runs,
 *      restaurants where owner_id matches, etc., per the schema).
 *   4. Return 204 No Content on success. The client signs out locally.
 *
 * Idempotency: if the user is already gone (e.g. a retry after a partial
 * failure), step 1 returns 401 — the client treats that as success because
 * the goal state is reached.
 *
 * Note on tenants: if the calling user is the owner of a restaurant, the
 * cascade will delete that restaurant and all its data (conversations,
 * messages, customers, etc.). This is the App-Store-compliant interpretation
 * of "delete my account and data". If you later want a softer policy
 * (transfer ownership instead of cascading), block deletion here when the
 * user owns active tenants and surface that as a UI-side error.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser();

    if (getUserError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // Step 1: explicit cleanup of rows that reference auth.users(id) without
    // an ON DELETE cascade. If any of these rows exist for this user, the
    // auth.admin.deleteUser call below would otherwise fail with a foreign
    // key violation. Order matters — child tables before parent.
    //
    // Each cleanup is best-effort and logs on failure rather than throwing,
    // because the goal is to leave the system in a state where the auth user
    // can be deleted. If a stray row blocks the final delete, the error
    // there is what we surface to the client.

    // team_members.user_id → auth.users(id) (no cascade in schema).
    {
      const { error } = await adminSupabaseClient
        .from("team_members")
        .delete()
        .eq("user_id", userId);
      if (error) {
        console.error("[delete-account] team_members cleanup failed", {
          userId,
          message: error.message,
        });
      }
    }

    // conversations.assigned_by_user_id → auth.users(id), nullable, no cascade.
    // Set to null so the conversation history is preserved but no longer
    // pinned to the deleted user.
    {
      const { error } = await adminSupabaseClient
        .from("conversations")
        .update({ assigned_by_user_id: null })
        .eq("assigned_by_user_id", userId);
      if (error) {
        console.error("[delete-account] conversations cleanup failed", {
          userId,
          message: error.message,
        });
      }
    }

    // conversation_claim_events.claimed_by_user_id → auth.users(id), nullable,
    // no cascade. Same pattern: null out, preserve history.
    {
      const { error } = await adminSupabaseClient
        .from("conversation_claim_events")
        .update({ claimed_by_user_id: null })
        .eq("claimed_by_user_id", userId);
      if (error) {
        // The table may not exist on older schemas — log and continue.
        console.error("[delete-account] claim_events cleanup failed", {
          userId,
          message: error.message,
        });
      }
    }

    // manager_audit_log.actor_user_id → auth.users(id), NOT NULL, no cascade.
    // Because the column is NOT NULL we can't null it out — delete the rows
    // for this actor. This loses audit trail for actions the deleted user
    // performed; that's the App-Store-compliant trade-off.
    {
      const { error } = await adminSupabaseClient
        .from("manager_audit_log")
        .delete()
        .eq("actor_user_id", userId);
      if (error) {
        console.error("[delete-account] audit_log cleanup failed", {
          userId,
          message: error.message,
        });
      }
    }

    // Step 2: hard-delete the auth user. This is the operation Apple cares
    // about — afterwards, the email cannot sign in and the auth.users row
    // is gone. Schema-level FKs cascade to profiles, provisioning_runs,
    // restaurants (where owner), and everything downstream of those tables.
    const { error: deleteAuthError } =
      await adminSupabaseClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      // Real failure — surface to the client so the UI can show an error
      // and let the user retry rather than silently leaving them in a half-
      // deleted state.
      console.error(
        "[delete-account] auth.admin.deleteUser failed",
        { userId, message: deleteAuthError.message }
      );
      return NextResponse.json(
        { error: deleteAuthError.message ?? "Failed to delete account" },
        { status: 500 }
      );
    }

    // 204 No Content — body intentionally empty.
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[delete-account] unexpected error", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
