/**
 * Kiara-specific seed helper.
 *
 * Merges the two Kiara MD source folders into a single tmp directory and
 * runs the generic seed CLI against it:
 *   - knowledge-base/kiara/*.md         (Business Intel Agent output, 12 files)
 *   - kiara-kowndge-base/*.md           (legacy web-scraped product/reservation pages)
 *
 * NOTE: the Kiara tenant was manually ingested on 2026-04-17 (225 chunks).
 * Running this script will CLEAR those chunks and re-ingest from source.
 * Pass --dry-run to preview without writing.
 *
 * Usage:
 *   npm run seed:kiara
 *   npm run seed:kiara -- --dry-run
 */

import fs from "fs";
import os from "os";
import path from "path";
import { ensureArabicAiAgent, runIngest, buildSupabaseFromEnv } from "./_lib/ingest";

const KIARA_RESTAURANT_ID = "2ba8f6c8-aff9-4147-8f13-cdcb732de698";

const REPO_ROOT = path.resolve(__dirname, "..");
const SOURCE_FOLDERS = [
  path.join(REPO_ROOT, "knowledge-base", "kiara"),
  path.join(REPO_ROOT, "kiara-kowndge-base"),
];

function copyMdFiles(from: string, to: string, prefix: string): number {
  if (!fs.existsSync(from)) {
    console.warn(`⚠️  Source folder missing, skipping: ${from}`);
    return 0;
  }
  const files = fs.readdirSync(from).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const src = path.join(from, f);
    // Prefix to avoid name collisions between the two folders.
    const dest = path.join(to, `${prefix}__${f}`);
    fs.copyFileSync(src, dest);
  }
  return files.length;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-kiara-"));
  console.log(`\n🥑 Staging Kiara knowledge in ${tmpDir}`);

  let staged = 0;
  staged += copyMdFiles(SOURCE_FOLDERS[0], tmpDir, "biz");
  staged += copyMdFiles(SOURCE_FOLDERS[1], tmpDir, "legacy");
  console.log(`   staged ${staged} files\n`);

  if (!staged) {
    console.error("No source files found — aborting.");
    process.exit(1);
  }

  try {
    const supabase = buildSupabaseFromEnv();

    let agentStatus: "created" | "updated" | "dry-run" = "dry-run";
    if (!dryRun) {
      const { created } = await ensureArabicAiAgent(supabase, KIARA_RESTAURANT_ID);
      agentStatus = created ? "created" : "updated";
    }

    const result = await runIngest({
      restaurantId: KIARA_RESTAURANT_ID,
      folderPath: tmpDir,
      supabase,
      dryRun,
      clearExisting: true,
    });

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Kiara seed complete`);
    console.log(`   restaurant_id: ${result.restaurantId}`);
    console.log(`   files:         ${result.filesProcessed}`);
    console.log(`   chunks:        ${result.chunksInserted}`);
    console.log(`   ai_agent:      ${agentStatus}`);
    console.log(`   duration:      ${result.durationMs}ms`);
    console.log(`   dry_run:       ${result.dryRun}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
