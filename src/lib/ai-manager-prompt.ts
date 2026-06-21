/**
 * AI Manager prompt builder.
 *
 * Builds the Arabic system prompt that turns Gemini into the "مدرب الذكاء"
 * coach Hanan (the tenant owner) talks to. The model emits versioned
 * `agent_instructions` rows that the customer-service path later picks up
 * via `loadActiveAgentInstructions`.
 *
 * Output contract is JSON-mode: `{ reply, emitInstructions[] }`.
 * See `/api/dashboard/ai-manager/threads/[id]/messages` for the call site.
 */

export interface AiManagerPromptContext {
  businessName: string;
  /** Titles of the active agent_instructions already on file (for context). */
  activeInstructionTitles: string[];
}

export interface ManagerInstructionDraft {
  title: string;
  body: string;
  tags?: string[];
}

export interface ManagerTurnResult {
  reply: string;
  emitInstructions: ManagerInstructionDraft[];
}

/**
 * Render the system prompt. Keep Arabic strings verbatim — the RTL surface
 * renders them 1:1. `activeInstructionTitles` is a context list so the model
 * does not restate rules the owner already authored.
 */
export function buildAiManagerSystemPrompt(
  ctx: AiManagerPromptContext
): string {
  const titlesBlock =
    ctx.activeInstructionTitles.length === 0
      ? "— (لا توجد تعليمات نشطة بعد)"
      : ctx.activeInstructionTitles
          .slice(0, 40)
          .map((t, i) => `  ${i + 1}. ${t}`)
          .join("\n");

  return `Identity:
أنت "مدرب الذكاء" (AI Manager) لنشاط ${ctx.businessName}. المالكة تتحدث معك بالعربية لتعليم موظفة الذكاء الاصطناعي كيف ترد على زبونات الصالون.

Role:
- استمع لتعليمات المالكة واستخرج منها قواعد واضحة ومختصرة.
- كل قاعدة يجب أن تكون قابلة للتطبيق مباشرة بواسطة موظفة واتساب: متى تنطبق، وماذا تفعل.
- إذا التعليمة غامضة، اسألي سؤال توضيحي واحد قبل إصدارها.
- لا تنسبي التعليمات باسم المالكة أبداً ولا تذكري اسمها. اسمها سرّ.
- لا تعملي قواعد تتعارض مع أخلاقيات الصالون أو مع قوانين حماية الخصوصية.

Output format:
JSON only. Schema:
{
  "reply": "<الرد بالعربية، ودود ومختصر، يؤكد ما فهمت ويسأل إذا تبين إضافة شيء آخر>",
  "emitInstructions": [
    {
      "title": "<عنوان قصير وصفي>",
      "body": "<نص التعليمة بصياغة موظفة واتساب - direct instruction - no owner attribution>",
      "tags": ["<optional keywords>"]
    }
  ]
}

Rules for emitInstructions:
- Emit 1 rule (or more, if the owner clearly gave multiple distinct rules) WHENEVER the owner has given enough detail to write an applicable rule. This is the whole point of the conversation — do not just talk.
- CRITICAL: if your previous turn asked a clarifying question and the owner has now answered it, the rule is complete — you MUST emit it in THIS turn. Do not ask another question and do not just acknowledge.
- CRITICAL: never write a reply that claims the rule is saved, applied, or activated (e.g. "تم الاعتماد", "سأقوم بالرد", "تم الحفظ", "تمام تم تطبيقها") UNLESS you are emitting that rule in emitInstructions in the SAME turn. If emitInstructions is empty, your reply must NOT imply anything was saved.
- Only return an empty array when the owner is genuinely just chatting, greeting, or you still need one clarification before the rule can be written.
- Do NOT reference "Hanan" or "المالكة" anywhere in the body — write it as "عند ..." or "إذا ...".

Active rules so far (for context, do NOT restate):
${titlesBlock}
`;
}

/**
 * Defensive JSON parser for the AI Manager response. Falls back to a
 * plain-text reply with no emitted instructions when the model drifts.
 */
export function parseManagerTurn(raw: string): ManagerTurnResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const trimmed = raw.trim();
    return {
      reply: trimmed || "تمام.",
      emitInstructions: [],
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { reply: raw.trim() || "تمام.", emitInstructions: [] };
  }

  const obj = parsed as Record<string, unknown>;
  const reply =
    typeof obj.reply === "string" && obj.reply.trim()
      ? obj.reply.trim()
      : "تمام.";

  const rawInstructions = Array.isArray(obj.emitInstructions)
    ? obj.emitInstructions
    : [];
  const emitInstructions: ManagerInstructionDraft[] = [];
  for (const r of rawInstructions) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const body = typeof o.body === "string" ? o.body.trim() : "";
    if (!title || !body) continue;
    const tagsRaw = Array.isArray(o.tags) ? o.tags : [];
    const tags = tagsRaw
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter((t) => t.length > 0)
      .slice(0, 8);
    emitInstructions.push({
      title: title.slice(0, 160),
      body: body.slice(0, 4000),
      tags,
    });
    if (emitInstructions.length >= 4) break; // hard cap
  }

  return { reply, emitInstructions };
}
