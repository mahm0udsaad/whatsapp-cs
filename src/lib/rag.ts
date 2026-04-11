import { embed } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { adminSupabaseClient } from "@/lib/supabase/admin";

const googleAI = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY!,
});

/**
 * Embed a query string using Google text-embedding-004
 */
async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({
    model: googleAI.textEmbeddingModel("text-embedding-004"),
    value: query,
  });
  return embedding;
}

/**
 * Retrieve the top-N most relevant knowledge chunks for a given query.
 * Uses vector cosine similarity via pgvector.
 */
export async function retrieveKnowledgeChunks(
  restaurantId: string,
  query: string,
  matchCount = 5
): Promise<string> {
  let embedding: number[];

  try {
    embedding = await embedQuery(query);
  } catch {
    // Fallback: return nothing rather than crash the reply job
    return "";
  }

  const { data, error } = await adminSupabaseClient.rpc(
    "match_knowledge_chunks",
    {
      query_embedding: embedding,
      match_restaurant_id: restaurantId,
      match_count: matchCount,
      match_threshold: 0.4,
    }
  );

  if (error || !data?.length) {
    return "";
  }

  return (data as { content: string }[])
    .map((chunk) => chunk.content)
    .join("\n\n");
}
