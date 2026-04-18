/**
 * Seed a tenant's RAG knowledge base from a folder of pre-scraped MD files.
 *
 * This is the "seed" path used to bootstrap tenants that arrive with pre-built
 * fixtures (e.g. Kiara). It is intentionally SEPARATE from the commercial
 * onboarding wizard at /onboarding — that flow (owner signup, Twilio
 * provisioning, website crawl) is untouched.
 *
 * Behavior:
 *  1. Validates the `restaurants` row exists (aborts otherwise).
 *  2. Ensures an Arabic `ai_agents` row exists (name=أمينة, language=ar,
 *     personality=دافئة ومحترفة, is_active=true, system_instructions='').
 *  3. Chunks + embeds all *.md files in the folder and replaces the
 *     knowledge_chunks rows for that tenant.
 *  4. Does NOT touch operational data (customers, orders, reservations,
 *     phone numbers).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-tenant-knowledge.ts \
 *     <restaurant_id> <folder_path> [--dry-run]
 *
 * --dry-run prints what it would do without writing to Supabase.
 */

import { ensureArabicAiAgent, runIngest, buildSupabaseFromEnv } from "./_lib/ingest";

function printUsage() {
  console.error(
    "Usage: npx tsx --env-file=.env.local scripts/seed-tenant-knowledge.ts <restaurant_id> <folder_path> [--dry-run]"
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((a) => !a.startsWith("--"));
  const [restaurantId, folderPath] = positional;

  if (!restaurantId || !folderPath) {
    printUsage();
    process.exit(1);
  }

  const supabase = buildSupabaseFromEnv();

  console.log(`\n🌱 Seeding tenant knowledge base`);
  console.log(`   restaurant_id: ${restaurantId}`);
  console.log(`   folder:        ${folderPath}`);
  console.log(`   dry_run:       ${dryRun}\n`);

  // Ensure ai_agents row (skip writes during dry-run).
  let agentStatus: "created" | "updated" | "dry-run" = "dry-run";
  if (!dryRun) {
    const { created } = await ensureArabicAiAgent(supabase, restaurantId);
    agentStatus = created ? "created" : "updated";
  }

  const result = await runIngest({
    restaurantId,
    folderPath,
    supabase,
    dryRun,
    clearExisting: true,
  });

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Seed complete`);
  console.log(`   restaurant_id: ${result.restaurantId}`);
  console.log(`   files:         ${result.filesProcessed}`);
  console.log(`   chunks:        ${result.chunksInserted}`);
  console.log(`   ai_agent:      ${agentStatus}`);
  console.log(`   duration:      ${result.durationMs}ms`);
  console.log(`   dry_run:       ${result.dryRun}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
