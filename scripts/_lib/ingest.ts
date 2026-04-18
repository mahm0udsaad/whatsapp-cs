/**
 * Shared RAG ingestion helpers.
 *
 * The historical entry point (scripts/ingest-knowledge-base.ts) and the new
 * seed CLI (scripts/seed-tenant-knowledge.ts) both delegate here so there is
 * exactly one implementation of chunking + embedding + insert.
 *
 * Embedding model: gemini-embedding-001 with outputDimensionality=768 (keeps
 * vectors compatible with the existing vector(768) column after text-embedding-004
 * was retired from v1beta in early 2026).
 */

import fs from "fs";
import path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { embedMany } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

// ── Config ────────────────────────────────────────────────────────────────────

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
export const CHUNK_SIZE = 500;
export const CHUNK_OVERLAP = 80;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IngestOptions {
  restaurantId: string;
  folderPath: string;
  supabase?: SupabaseClient;
  dryRun?: boolean;
  /** If false, skip DELETE-of-existing step (e.g. when appending). Defaults to true. */
  clearExisting?: boolean;
  /** Optional logger. Defaults to console.log. */
  log?: (msg: string) => void;
}

export interface IngestResult {
  restaurantId: string;
  filesProcessed: number;
  chunksInserted: number;
  durationMs: number;
  dryRun: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strip markdown syntax to get clean plain text for embedding. */
export function cleanMarkdown(text: string): string {
  return text
    .replace(/^---[\s\S]*?---\n?/, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split text into overlapping chunks of ~CHUNK_SIZE characters. */
export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 30);

  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length <= CHUNK_SIZE) {
      current = current ? current + "\n\n" + para : para;
    } else {
      if (current.trim()) {
        chunks.push(current.trim());
        const words = current.split(" ");
        const overlapWords = words.slice(
          Math.max(0, words.length - Math.floor(CHUNK_OVERLAP / 5))
        );
        current = overlapWords.join(" ") + "\n\n" + para;
      } else {
        for (let i = 0; i < para.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
          chunks.push(para.slice(i, i + CHUNK_SIZE).trim());
        }
        current = "";
      }
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return [...new Set(chunks)];
}

/** Build a Supabase admin client from env. */
export function buildSupabaseFromEnv(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function buildGoogleAI() {
  const key = process.env.GOOGLE_GEMINI_API_KEY;
  if (!key) {
    throw new Error("Missing GOOGLE_GEMINI_API_KEY");
  }
  return createGoogleGenerativeAI({ apiKey: key });
}

/**
 * Embed chunks in batches. Free-tier Gemini quota is 100 embed_content items
 * per minute per model — cap batch size at 10 and sleep 7s between batches
 * (≈85/min, comfortably under the limit) with 429 retry.
 */
export async function embedChunks(chunks: string[]): Promise<number[][]> {
  const googleAI = buildGoogleAI();
  const BATCH_SIZE = 10;
  const INTER_BATCH_SLEEP_MS = 7000;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);
    console.log(
      `  Embedding batch ${batchIndex}/${totalBatches} (${batch.length} chunks)…`
    );

    let attempt = 0;
    while (true) {
      try {
        const { embeddings } = await embedMany({
          model: googleAI.embeddingModel(EMBEDDING_MODEL),
          values: batch,
          providerOptions: {
            google: { outputDimensionality: EMBEDDING_DIMENSIONS },
          },
        });
        allEmbeddings.push(...embeddings);
        break;
      } catch (err) {
        attempt += 1;
        const msg = err instanceof Error ? err.message : String(err);
        const isQuota =
          /RESOURCE_EXHAUSTED|429|quota|rate limit/i.test(msg) && attempt < 4;
        if (!isQuota) throw err;
        const waitMs = 30_000 * attempt;
        console.log(`  ⏳ quota hit, sleeping ${waitMs / 1000}s before retry`);
        await sleep(waitMs);
      }
    }

    if (i + BATCH_SIZE < chunks.length) {
      await sleep(INTER_BATCH_SLEEP_MS);
    }
  }

  return allEmbeddings;
}

/**
 * Validate that a restaurant exists. Throws on miss.
 */
export async function assertRestaurantExists(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id")
    .eq("id", restaurantId)
    .maybeSingle();

  if (error) {
    throw new Error(`Restaurant lookup failed: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      `Restaurant ${restaurantId} not found — aborting. Create the restaurant row before seeding knowledge.`
    );
  }
}

/**
 * Ensure an ai_agents row exists with Arabic defaults for seeded tenants.
 * Returns { created: boolean } so the caller can log it.
 */
export async function ensureArabicAiAgent(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<{ created: boolean; id: string }> {
  const { data: existing, error } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`ai_agents lookup failed: ${error.message}`);
  }

  if (existing) {
    return { created: false, id: existing.id };
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from("ai_agents")
    .insert({
      restaurant_id: restaurantId,
      name: "أمينة",
      language_preference: "ar",
      personality: "دافئة ومحترفة",
      // Leave empty — src/lib/customer-service.ts builds the effective prompt.
      system_instructions: "",
      off_topic_response: "عذراً، أنا متخصص فقط في الإجابة على أسئلة هذا العمل.",
      chat_mode: "text_input",
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(
      `Failed to create ai_agents row: ${insertError?.message ?? "unknown"}`
    );
  }

  return { created: true, id: inserted.id };
}

/**
 * Core ingest routine — reusable from CLI and API route.
 *
 * Semantics:
 *  - Validates restaurant exists.
 *  - Clears existing knowledge_chunks for the tenant (unless clearExisting=false).
 *  - Reads *.md from folderPath, chunks + embeds + inserts.
 *  - Does NOT touch operational tables (customers/orders/reservations/phone numbers).
 *  - Does NOT create/modify ai_agents (call ensureArabicAiAgent separately).
 */
export async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const startedAt = Date.now();
  const log = opts.log ?? ((m: string) => console.log(m));
  const supabase = opts.supabase ?? buildSupabaseFromEnv();
  const clearExisting = opts.clearExisting ?? true;
  const dryRun = opts.dryRun ?? false;

  await assertRestaurantExists(supabase, opts.restaurantId);

  const absoluteFolder = path.resolve(opts.folderPath);
  if (!fs.existsSync(absoluteFolder)) {
    throw new Error(`Folder not found: ${absoluteFolder}`);
  }

  const mdFiles = fs
    .readdirSync(absoluteFolder)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(absoluteFolder, f));

  if (!mdFiles.length) {
    throw new Error(`No .md files found in folder: ${absoluteFolder}`);
  }

  log(`📚 Found ${mdFiles.length} knowledge base files`);
  log(`🏪 Restaurant ID: ${opts.restaurantId}`);
  if (dryRun) log(`🧪 DRY RUN — no DB writes will occur`);

  // Pre-compute chunks per file for visibility (and to short-circuit dry-run).
  const perFile: { file: string; chunks: string[] }[] = [];
  for (const filePath of mdFiles) {
    const fileName = path.basename(filePath);
    const raw = fs.readFileSync(filePath, "utf-8");
    const cleaned = cleanMarkdown(raw);
    const chunks = chunkText(cleaned);
    perFile.push({ file: fileName, chunks });
    log(`📄 ${fileName} → ${chunks.length} chunks`);
  }

  if (dryRun) {
    return {
      restaurantId: opts.restaurantId,
      filesProcessed: perFile.filter((p) => p.chunks.length).length,
      chunksInserted: 0,
      durationMs: Date.now() - startedAt,
      dryRun: true,
    };
  }

  if (clearExisting) {
    log(`🗑️  Clearing existing chunks for this restaurant…`);
    const { error } = await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("restaurant_id", opts.restaurantId);
    if (error) {
      throw new Error(`Failed to delete existing chunks: ${error.message}`);
    }
  }

  // Embed + collect rows.
  const allRows: {
    restaurant_id: string;
    content: string;
    embedding: number[];
    source_file: string;
    chunk_index: number;
  }[] = [];

  for (const { file, chunks } of perFile) {
    if (!chunks.length) {
      log(`  ⏭️  ${file} — no usable chunks, skipping`);
      continue;
    }
    const embeddings = await embedChunks(chunks);
    chunks.forEach((content, i) => {
      allRows.push({
        restaurant_id: opts.restaurantId,
        content,
        embedding: embeddings[i],
        source_file: file,
        chunk_index: i,
      });
    });
  }

  log(`💾 Inserting ${allRows.length} chunks into Supabase…`);
  const INSERT_BATCH = 50;
  for (let i = 0; i < allRows.length; i += INSERT_BATCH) {
    const batch = allRows.slice(i, i + INSERT_BATCH);
    const { error } = await supabase.from("knowledge_chunks").insert(batch);
    if (error) {
      throw new Error(
        `Insert failed at batch ${i / INSERT_BATCH + 1}: ${error.message}`
      );
    }
    process.stdout.write(
      `\r  Inserted ${Math.min(i + INSERT_BATCH, allRows.length)}/${allRows.length}`
    );
  }
  if (allRows.length) process.stdout.write("\n");

  return {
    restaurantId: opts.restaurantId,
    filesProcessed: perFile.filter((p) => p.chunks.length).length,
    chunksInserted: allRows.length,
    durationMs: Date.now() - startedAt,
    dryRun: false,
  };
}

// Exported for tests + CLI composition.
export { buildGoogleAI };
