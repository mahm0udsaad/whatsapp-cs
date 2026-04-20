/**
 * One-shot seed: bulk-upsert customers imported from Rekaz into the Kiara
 * tenant. Reads the normalized payload from
 *   scripts/_kiara-customers-seed.json
 * Uses the service-role key so RLS doesn't reject the insert.
 *
 * Run:   pnpm tsx scripts/seed-kiara-customers.ts
 *        (or) npx tsx scripts/seed-kiara-customers.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Requires Node 20.6+:  node --env-file=.env.local  scripts/seed-kiara-customers.ts
// Or via tsx:           npx tsx --env-file=.env.local scripts/seed-kiara-customers.ts

const KIARA_RESTAURANT_ID = "2ba8f6c8-aff9-4147-8f13-cdcb732de698";
const SEED_PATH = "scripts/_kiara-customers-seed.json";
const CHUNK = 200;

interface SeedRow {
  phone: string;
  name: string | null;
  source_ref: string | null;
  creation: string | null;
  cust_type: string | null;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows: SeedRow[] = JSON.parse(readFileSync(SEED_PATH, "utf-8"));
  console.log(`[seed] ${rows.length} rows from ${SEED_PATH}`);

  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const payload = chunk.map((r) => ({
      restaurant_id: KIARA_RESTAURANT_ID,
      phone_number: r.phone,
      full_name: r.name,
      source: "rekaz_import" as const,
      source_ref: r.source_ref,
      last_seen_at: r.creation,
      metadata: { customer_type: r.cust_type },
    }));

    const { error, count } = await supabase
      .from("customers")
      .upsert(payload, {
        onConflict: "restaurant_id,phone_number",
        count: "exact",
      });

    if (error) {
      console.error(`[seed] chunk ${i / CHUNK} failed:`, error.message);
      process.exit(1);
    }
    upserted += count ?? chunk.length;
    console.log(`[seed] chunk ${i / CHUNK}: ${count ?? chunk.length} rows`);
  }

  const { count: total } = await supabase
    .from("customers")
    .select("id", { head: true, count: "exact" })
    .eq("restaurant_id", KIARA_RESTAURANT_ID);
  console.log(`[seed] done: upserted=${upserted} total_in_tenant=${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
