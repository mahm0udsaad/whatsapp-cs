/**
 * RAG Knowledge Base Ingestion Script (compatibility shim)
 *
 * The original implementation has moved to `scripts/_lib/ingest.ts`. This file
 * remains as a thin CLI wrapper so that existing commands (and the
 * `npm run ingest` alias) keep working identically.
 *
 * Usage:
 *   npx tsx scripts/ingest-knowledge-base.ts <restaurant_id> <folder_path>
 *
 * For the richer seed flow (validates restaurant, ensures Arabic ai_agents
 * row, supports --dry-run), use `scripts/seed-tenant-knowledge.ts`.
 */

import { runIngest } from "./_lib/ingest";

async function main() {
  const [restaurantId, folderPath] = process.argv.slice(2);

  if (!restaurantId || !folderPath) {
    console.error(
      "Usage: npx tsx scripts/ingest-knowledge-base.ts <restaurant_id> <folder_path>"
    );
    process.exit(1);
  }

  const result = await runIngest({
    restaurantId,
    folderPath,
    clearExisting: true,
  });

  console.log(
    `\n✅ Done! ${result.chunksInserted} chunks stored for restaurant ${result.restaurantId} (${result.filesProcessed} files, ${result.durationMs}ms)`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
