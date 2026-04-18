import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { assertOwnsThread, getOwnerContext } from "@/lib/ai-manager-auth";
import { runAiManagerTurn } from "@/lib/ai-manager-gemini";
import { loadActiveAgentInstructions } from "@/lib/agent-instructions";

const HISTORY_LIMIT = 20;
const MAX_OWNER_CONTENT = 4000;

// Arabic fallback when Gemini fails. Inserted as an assistant message with
// metadata.error so the UI can style it / the ops team can grep it.
const GEMINI_FALLBACK = "عذراً، حدث خطأ. حاولي مرة أخرى.";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const owner = await getOwnerContext();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thread = await assertOwnsThread(owner, id);
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await adminSupabaseClient
    .from("owner_ai_manager_messages")
    .select("id, role, content, metadata, created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    thread: {
      id: thread.id,
      title: thread.title,
      restaurant_id: thread.restaurant_id,
    },
    messages: data ?? [],
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const owner = await getOwnerContext();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thread = await assertOwnsThread(owner, id);
  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { content?: unknown };
  try {
    body = (await request.json()) as { content?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawContent = typeof body.content === "string" ? body.content : "";
  const content = rawContent.trim().slice(0, MAX_OWNER_CONTENT);
  if (!content) {
    return NextResponse.json(
      { error: "Message content is required" },
      { status: 400 }
    );
  }

  // 1. Insert the owner's message. This also gives us a `created_at` anchor
  //    for the turn so the assistant row sorts after it.
  const { data: ownerMsg, error: insertErr } = await adminSupabaseClient
    .from("owner_ai_manager_messages")
    .insert({
      thread_id: id,
      role: "owner",
      content,
      metadata: {},
    })
    .select("id, role, content, metadata, created_at")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // 2. First-turn title dedup. Two simultaneous POSTs to the SAME thread
  //    could both see title=null and both try to set it. We guard with a
  //    conditional update `where title is null` — Postgres serializes this,
  //    so only the first writer wins. We ignore a zero-row result.
  if (!thread.title) {
    const derivedTitle = content.slice(0, 40);
    await adminSupabaseClient
      .from("owner_ai_manager_threads")
      .update({ title: derivedTitle })
      .eq("id", id)
      .is("title", null);
  }

  // 3. Load recent history and active rules for prompt context. The history
  //    we JUST inserted is excluded from the Gemini context (we pass it as
  //    `ownerMessage`), but we keep the last N-1 for conversational memory.
  const [{ data: historyRows }, activeInstructions] = await Promise.all([
    adminSupabaseClient
      .from("owner_ai_manager_messages")
      .select("role, content, created_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT + 1),
    loadActiveAgentInstructions(thread.restaurant_id),
  ]);

  const historyAsc = (
    (historyRows ?? []) as Array<{
      role: "owner" | "assistant" | "system";
      content: string;
      created_at: string;
    }>
  )
    .slice()
    .reverse()
    .filter((r) => r.role !== "system")
    .filter(
      (r) =>
        !(
          r.content === content &&
          r.created_at === (ownerMsg as { created_at: string }).created_at
        )
    )
    .map((r) => ({
      role: r.role as "owner" | "assistant",
      content: r.content,
    }));

  // 4. Fetch businessName for the prompt.
  const { data: restaurantRow } = await adminSupabaseClient
    .from("restaurants")
    .select("name, name_ar")
    .eq("id", thread.restaurant_id)
    .maybeSingle();
  const businessName =
    (restaurantRow as { name_ar?: string; name?: string } | null)
      ?.name_ar ??
    (restaurantRow as { name?: string } | null)?.name ??
    "النشاط";

  // 5. Call Gemini. On failure, insert the fallback message with error metadata.
  let replyText = "";
  let emittedInstructionIds: string[] = [];
  let emittedRows: Array<{
    id: string;
    version: number;
    title: string;
    body: string;
    tags: string[];
  }> = [];
  let errorMessage: string | null = null;

  try {
    const result = await runAiManagerTurn({
      promptContext: {
        businessName,
        activeInstructionTitles: activeInstructions.map((r) => r.title),
      },
      history: historyAsc,
      ownerMessage: content,
    });

    replyText = result.reply;

    // 6. Insert each emitted instruction. The DB trigger assigns `version`.
    if (result.emitInstructions.length > 0) {
      const insertPayload = result.emitInstructions.map((draft) => ({
        restaurant_id: thread.restaurant_id,
        // `version` is NOT NULL with a trigger — the trigger overrides the
        // value we pass, but the column has no default, so we supply a
        // placeholder to satisfy the insert.
        version: 0,
        title: draft.title,
        body: draft.body,
        tags: draft.tags ?? [],
        status: "active",
        author_user_id: owner.userId,
        authored_via: "ai_manager",
        source_thread_id: id,
      }));
      const { data: inserted, error: insErr } = await adminSupabaseClient
        .from("agent_instructions")
        .insert(insertPayload)
        .select("id, version, title, body, tags");
      if (insErr) {
        console.warn(
          "[ai-manager] instruction insert failed:",
          insErr.message
        );
      } else {
        emittedRows = (inserted ?? []).map((r) => {
          const row = r as {
            id: string;
            version: number;
            title: string;
            body: string;
            tags: string[] | null;
          };
          return {
            id: row.id,
            version: row.version,
            title: row.title,
            body: row.body,
            tags: row.tags ?? [],
          };
        });
        emittedInstructionIds = emittedRows.map((r) => r.id);
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    replyText = GEMINI_FALLBACK;
    console.error("[ai-manager] turn failed:", errorMessage);
  }

  // 7. Insert the assistant message with emitted_instruction_ids in metadata.
  const assistantMetadata: Record<string, unknown> = {};
  if (emittedInstructionIds.length > 0) {
    assistantMetadata.emitted_instruction_ids = emittedInstructionIds;
    assistantMetadata.emitted_instructions = emittedRows.map((r) => ({
      id: r.id,
      version: r.version,
      title: r.title,
    }));
  }
  if (errorMessage) {
    assistantMetadata.error = errorMessage;
  }

  const { data: assistantMsg, error: assistantErr } = await adminSupabaseClient
    .from("owner_ai_manager_messages")
    .insert({
      thread_id: id,
      role: "assistant",
      content: replyText,
      metadata: assistantMetadata,
    })
    .select("id, role, content, metadata, created_at")
    .single();

  if (assistantErr) {
    return NextResponse.json(
      { error: assistantErr.message },
      { status: 500 }
    );
  }

  // 8. Bump last_message_at.
  await adminSupabaseClient
    .from("owner_ai_manager_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({
    ownerMessage: ownerMsg,
    assistantMessage: assistantMsg,
    emittedInstructions: emittedRows,
  });
}
