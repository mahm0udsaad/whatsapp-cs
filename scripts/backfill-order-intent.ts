/**
 * One-off / re-runnable: fill `orders.extracted_intent` for any pending
 * order that is missing it. Run after deploying the migration so existing
 * approval cards in the mobile app get the same structured context that
 * new orders already receive via `createOrder`.
 *
 * Usage:
 *   bun run scripts/backfill-order-intent.ts
 *   bun run scripts/backfill-order-intent.ts --all   # include non-pending too
 *
 * Throttled to avoid blasting Gemini — ~1 request/second.
 */

import { extractOrderIntent } from "@/lib/extract-order-intent";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const includeAll = process.argv.includes("--all");

async function main() {
  let query = adminSupabaseClient
    .from("orders")
    .select("id, conversation_id, details, escalation_reason, status, type")
    .is("extracted_intent", null)
    .order("created_at", { ascending: false });

  if (!includeAll) {
    query = query.eq("status", "pending");
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  console.log(
    `[backfill] ${rows.length} orders need extracted_intent ` +
      `(includeAll=${includeAll})`
  );
  if (rows.length === 0) return;

  let ok = 0;
  let skipped = 0;

  for (const row of rows) {
    const fallback = (row.details ?? "").trim();
    if (!row.conversation_id || !fallback) {
      skipped += 1;
      continue;
    }
    try {
      const intent = await extractOrderIntent({
        conversationId: row.conversation_id,
        fallbackMessage: fallback,
        escalationReason: row.escalation_reason ?? null,
      });
      if (!intent) {
        skipped += 1;
      } else {
        const { error: upErr } = await adminSupabaseClient
          .from("orders")
          .update({ extracted_intent: intent })
          .eq("id", row.id);
        if (upErr) {
          console.warn(`  ✗ ${row.id} update: ${upErr.message}`);
          skipped += 1;
        } else {
          ok += 1;
          console.log(`  ✓ ${row.id} (${intent.kind})`);
        }
      }
    } catch (err) {
      skipped += 1;
      console.warn(
        `  ✗ ${row.id}:`,
        err instanceof Error ? err.message : err
      );
    }
    // Simple rate-limit: ~1 req/sec is gentle on Gemini quotas.
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[backfill] done — ok=${ok} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
