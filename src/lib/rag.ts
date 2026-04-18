import { createHash } from "node:crypto";
import { embed } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const googleAI = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY!,
});

/**
 * Default cosine-similarity threshold for knowledge retrieval. Raised from
 * 0.4 → 0.55 in the v2 optimization pass: 0.4 was permissive enough to admit
 * unrelated chunks, which both inflated prompt size and biased the model
 * toward off-topic answers. Env override (`RAG_MATCH_THRESHOLD`) allows
 * per-deploy tuning without a redeploy.
 */
export const RAG_MATCH_THRESHOLD = (() => {
  const env = Number.parseFloat(process.env.RAG_MATCH_THRESHOLD ?? "");
  return Number.isFinite(env) && env > 0 && env < 1 ? env : 0.55;
})();

/** Chunks with similarity at/above this are considered "strong" hits. */
export const RAG_STRONG_HIT_THRESHOLD = 0.65;

// ---------------------------------------------------------------------------
// Query embedding cache. Embedding calls add ~200-400ms to every turn; the
// same customer often sends the same phrasing (retries, follow-ups). Keyed
// on a SHA1 of the expanded query — embeddings are not tenant-scoped, so no
// restaurantId in the key.
// ---------------------------------------------------------------------------

const EMBEDDING_CACHE_MAX = 500;
const EMBEDDING_CACHE_TTL_MS = 10 * 60_000;
const embeddingCache = new Map<
  string,
  { embedding: number[]; expiresAt: number }
>();

function cacheKey(query: string): string {
  return createHash("sha1").update(query).digest("hex");
}

function readEmbeddingCache(query: string): number[] | null {
  if (query.length < 3) return null;
  const key = cacheKey(query);
  const hit = embeddingCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    embeddingCache.delete(key);
    return null;
  }
  // Touch: re-insert so it moves to the end (LRU approximation).
  embeddingCache.delete(key);
  embeddingCache.set(key, hit);
  return hit.embedding;
}

function writeEmbeddingCache(query: string, embedding: number[]): void {
  if (query.length < 3) return;
  const key = cacheKey(query);
  embeddingCache.set(key, {
    embedding,
    expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS,
  });
  while (embeddingCache.size > EMBEDDING_CACHE_MAX) {
    // Map iteration order is insertion order — drop the oldest entry.
    const oldest = embeddingCache.keys().next().value;
    if (oldest === undefined) break;
    embeddingCache.delete(oldest);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Embed a query string using Google gemini-embedding-001 (768d). */
async function embedQuery(query: string): Promise<number[]> {
  const cached = readEmbeddingCache(query);
  if (cached) return cached;
  const { embedding } = await embed({
    model: googleAI.embeddingModel("gemini-embedding-001"),
    value: query,
    providerOptions: {
      google: { outputDimensionality: 768 },
    },
  });
  writeEmbeddingCache(query, embedding);
  return embedding;
}

export interface RetrievedChunk {
  content: string;
  similarity: number;
}

export interface RetrievalResult {
  /** Joined chunk text, preserved for callers that only need context text. */
  context: string;
  /** Scored chunks, in descending similarity order. */
  chunks: RetrievedChunk[];
}

/**
 * Retrieve the top-N most relevant knowledge chunks for a given query.
 * Returns both the joined context string and per-chunk similarity scores
 * so callers can make grounding / escalation decisions.
 */
export async function retrieveKnowledgeChunks(
  restaurantId: string,
  query: string,
  matchCount = 5,
  matchThreshold: number = RAG_MATCH_THRESHOLD
): Promise<RetrievalResult> {
  let embedding: number[];
  try {
    embedding = await embedQuery(query);
  } catch {
    return { context: "", chunks: [] };
  }

  const { data, error } = await adminSupabaseClient.rpc(
    "match_knowledge_chunks",
    {
      query_embedding: embedding,
      match_restaurant_id: restaurantId,
      match_count: matchCount,
      match_threshold: matchThreshold,
    }
  );

  if (error || !data?.length) {
    return { context: "", chunks: [] };
  }

  const chunks = (data as { content: string; similarity: number }[]).map(
    (row) => ({
      content: row.content,
      similarity: typeof row.similarity === "number" ? row.similarity : 0,
    })
  );

  return {
    context: chunks.map((c) => c.content).join("\n\n"),
    chunks,
  };
}
