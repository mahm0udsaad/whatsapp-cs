/**
 * Super-admin-only: re-ingest a tenant's RAG knowledge base from a folder
 * of pre-scraped MD files on the server filesystem.
 *
 * POST /api/internal/reingest-knowledge
 * Body: { restaurantId: string, folderPath: string, dryRun?: boolean }
 *
 * This route runs the same ingest pipeline as `scripts/seed-tenant-knowledge.ts`
 * and is intended for internal re-runs. It is SEPARATE from the commercial
 * owner-facing knowledge-base UI which operates on the `knowledge_base` table
 * (manual entries + website crawl). This route writes to `knowledge_chunks`
 * (RAG embeddings).
 *
 * Auth: requires the caller to be a profile with is_super_admin = true, OR to
 * present a valid CRON_SECRET / KNOWLEDGE_REINGEST_SECRET bearer token for
 * headless/ops callers.
 */

import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/tenant";
import {
  ensureArabicAiAgent,
  runIngest,
} from "../../../../../scripts/_lib/ingest";

function bearerAuthorized(request: NextRequest): boolean {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  if (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) {
    return true;
  }
  if (
    process.env.KNOWLEDGE_REINGEST_SECRET &&
    bearer === process.env.KNOWLEDGE_REINGEST_SECRET
  ) {
    return true;
  }
  return false;
}

async function userIsSuperAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const { data } = await adminSupabaseClient
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  return Boolean(data?.is_super_admin);
}

export async function POST(request: NextRequest) {
  try {
    const authorized =
      bearerAuthorized(request) || (await userIsSuperAdmin());
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      restaurantId?: string;
      folderPath?: string;
      dryRun?: boolean;
    };

    const { restaurantId, folderPath, dryRun } = body;
    if (!restaurantId || !folderPath) {
      return NextResponse.json(
        {
          error:
            "restaurantId and folderPath are required. folderPath must be an absolute path accessible to the Next.js server process.",
        },
        { status: 400 }
      );
    }

    // Resolve the folder path against the repo root when a relative path is
    // supplied. Absolute paths are used as-is.
    const resolved = path.isAbsolute(folderPath)
      ? folderPath
      : path.resolve(process.cwd(), folderPath);

    if (!dryRun) {
      await ensureArabicAiAgent(adminSupabaseClient, restaurantId);
    }

    const result = await runIngest({
      restaurantId,
      folderPath: resolved,
      supabase: adminSupabaseClient,
      dryRun: Boolean(dryRun),
      clearExisting: true,
    });

    return NextResponse.json({
      ok: true,
      chunksInserted: result.chunksInserted,
      filesProcessed: result.filesProcessed,
      durationMs: result.durationMs,
      dryRun: result.dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
