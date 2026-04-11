/**
 * RAG Knowledge Base Ingestion Script
 *
 * Reads .md files from a knowledge base folder, chunks the content,
 * embeds each chunk using Google's text-embedding-004 model via Vercel AI SDK,
 * and stores the results in Supabase knowledge_chunks table.
 *
 * Usage:
 *   npx tsx scripts/ingest-knowledge-base.ts <restaurant_id> <folder_path>
 *
 * Example:
 *   npx tsx scripts/ingest-knowledge-base.ts abc-123 ./kiara-kowndge-base
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { embedMany } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GOOGLE_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;

const googleAI = createGoogleGenerativeAI({ apiKey: GOOGLE_API_KEY });

const CHUNK_SIZE = 500;   // characters per chunk
const CHUNK_OVERLAP = 80; // overlap between chunks to preserve context

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip markdown syntax to get clean plain text for embedding */
function cleanMarkdown(text: string): string {
  return text
    // Remove frontmatter
    .replace(/^---[\s\S]*?---\n?/, "")
    // Remove image markdown
    .replace(/!\[.*?\]\(.*?\)/g, "")
    // Convert links to just their label text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove bare URLs
    .replace(/https?:\/\/\S+/g, "")
    // Remove markdown headings markers (keep the text)
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold/italic markers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    // Remove excessive whitespace and blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split text into overlapping chunks of ~CHUNK_SIZE characters */
function chunkText(text: string): string[] {
  const chunks: string[] = [];

  // Split by paragraph first to avoid cutting mid-sentence
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 30);

  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length <= CHUNK_SIZE) {
      current = current ? current + "\n\n" + para : para;
    } else {
      if (current.trim()) {
        chunks.push(current.trim());
        // Keep last part of current as overlap for next chunk
        const words = current.split(" ");
        const overlapWords = words.slice(
          Math.max(0, words.length - Math.floor(CHUNK_OVERLAP / 5))
        );
        current = overlapWords.join(" ") + "\n\n" + para;
      } else {
        // Para itself is too long — hard split
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

  // Deduplicate identical chunks (common with scraped repeated boilerplate)
  return [...new Set(chunks)];
}

/** Embed chunks in batches (Google API has a batch limit) */
async function embedChunks(chunks: string[]): Promise<number[][]> {
  const BATCH_SIZE = 20;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    console.log(
      `  Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${batch.length} chunks)…`
    );

    const { embeddings } = await embedMany({
      model: googleAI.textEmbeddingModel("text-embedding-004"),
      values: batch,
    });

    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [restaurantId, folderPath] = process.argv.slice(2);

  if (!restaurantId || !folderPath) {
    console.error(
      "Usage: npx tsx scripts/ingest-knowledge-base.ts <restaurant_id> <folder_path>"
    );
    process.exit(1);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  if (!GOOGLE_API_KEY) {
    console.error("Missing GOOGLE_GEMINI_API_KEY");
    process.exit(1);
  }

  const absoluteFolder = path.resolve(folderPath);

  if (!fs.existsSync(absoluteFolder)) {
    console.error(`Folder not found: ${absoluteFolder}`);
    process.exit(1);
  }

  const mdFiles = fs
    .readdirSync(absoluteFolder)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(absoluteFolder, f));

  if (!mdFiles.length) {
    console.error("No .md files found in folder");
    process.exit(1);
  }

  console.log(`\n📚 Found ${mdFiles.length} knowledge base files`);
  console.log(`🏪 Restaurant ID: ${restaurantId}\n`);

  // Step 1 — Delete existing chunks for this restaurant
  console.log("🗑️  Clearing existing chunks for this restaurant…");
  const { error: deleteError } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("restaurant_id", restaurantId);

  if (deleteError) {
    console.error("Failed to delete existing chunks:", deleteError.message);
    process.exit(1);
  }

  // Step 2 — Process each file
  const allRows: {
    restaurant_id: string;
    content: string;
    embedding: number[];
    source_file: string;
    chunk_index: number;
  }[] = [];

  for (const filePath of mdFiles) {
    const fileName = path.basename(filePath);
    const raw = fs.readFileSync(filePath, "utf-8");
    const cleaned = cleanMarkdown(raw);
    const chunks = chunkText(cleaned);

    if (!chunks.length) {
      console.log(`  ⏭️  ${fileName} — no usable chunks, skipping`);
      continue;
    }

    console.log(`📄 ${fileName} → ${chunks.length} chunks`);

    const embeddings = await embedChunks(chunks);

    chunks.forEach((content, i) => {
      allRows.push({
        restaurant_id: restaurantId,
        content,
        embedding: embeddings[i],
        source_file: fileName,
        chunk_index: i,
      });
    });
  }

  // Step 3 — Batch insert into Supabase
  console.log(`\n💾 Inserting ${allRows.length} chunks into Supabase…`);

  const INSERT_BATCH = 50;
  for (let i = 0; i < allRows.length; i += INSERT_BATCH) {
    const batch = allRows.slice(i, i + INSERT_BATCH);
    const { error } = await supabase.from("knowledge_chunks").insert(batch);

    if (error) {
      console.error(`Insert failed at batch ${i / INSERT_BATCH + 1}:`, error.message);
      process.exit(1);
    }

    process.stdout.write(
      `\r  Inserted ${Math.min(i + INSERT_BATCH, allRows.length)}/${allRows.length}`
    );
  }

  console.log(`\n\n✅ Done! ${allRows.length} chunks stored for restaurant ${restaurantId}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
