/**
 * One-off: backfill knowledge_chunks for Nehgz Hub from the tenant's
 * knowledge_base rows (which the onboarding UI populates but never
 * embeds). Dumps each row to /tmp/nehgz-kb/*.md, then runs the standard
 * ingest pipeline so the output is identical to the crawl-based flow.
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { runIngest, ensureArabicAiAgent } from "./_lib/ingest";

const RESTAURANT_ID = "11111111-aaaa-4aaa-8aaa-000000001001";
const OUT_DIR = "/tmp/nehgz-kb";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing SUPABASE env");

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("knowledge_base")
    .select("id, title, content")
    .eq("restaurant_id", RESTAURANT_ID);
  if (error) throw error;
  if (!data?.length) throw new Error("No knowledge_base rows for Nehgz");

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const row of data) {
    const slug =
      (row.title || row.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || row.id;
    const body = row.title
      ? `# ${row.title}\n\n${row.content}\n`
      : `${row.content}\n`;
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.md`), body, "utf8");
  }
  console.log(`wrote ${data.length} md files to ${OUT_DIR}`);

  await ensureArabicAiAgent(supabase, RESTAURANT_ID).catch(() => undefined);

  const result = await runIngest({
    restaurantId: RESTAURANT_ID,
    folderPath: OUT_DIR,
    supabase,
    clearExisting: true,
  });

  console.log(
    `chunksInserted=${result.chunksInserted} filesProcessed=${result.filesProcessed} durationMs=${result.durationMs}`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
