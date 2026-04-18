/**
 * Gemini call for the AI Manager (owner-coach) surface.
 *
 * Separate from `src/lib/gemini.ts` because the output schema, history shape,
 * and failure-handling are all different — the CS path returns interactive
 * replies, this path returns `{ reply, emitInstructions[] }`.
 *
 * Uses the same `@google/generative-ai` SDK and env var as `src/lib/gemini.ts`.
 */

import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import {
  buildAiManagerSystemPrompt,
  parseManagerTurn,
  type AiManagerPromptContext,
  type ManagerTurnResult,
} from "./ai-manager-prompt";

const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

if (!apiKey) {
  // Mirror gemini.ts — fail fast at module load if the key is missing.
  throw new Error("Missing GOOGLE_GEMINI_API_KEY environment variable");
}

const genAI = new GoogleGenerativeAI(apiKey);

// Use the same model family as the CS path. Trading off: cheaper + faster
// per turn matters more here because the owner is waiting synchronously.
const MODEL_NAME = "gemini-3.1-flash-lite-preview";

const MANAGER_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    reply: {
      type: SchemaType.STRING,
      description:
        "Arabic conversational reply to the owner. Short, warm, confirms understanding, asks one follow-up if the instruction was ambiguous.",
    },
    emitInstructions: {
      type: SchemaType.ARRAY,
      description:
        "0 or more versioned rules to insert into agent_instructions. Emit only when the owner clearly gave a rule.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          title: {
            type: SchemaType.STRING,
            description: "Short descriptive Arabic title for the rule.",
          },
          body: {
            type: SchemaType.STRING,
            description:
              "The rule phrased as a direct instruction to the WhatsApp agent. No owner attribution.",
          },
          tags: {
            type: SchemaType.ARRAY,
            description: "Optional Arabic or English keywords to help filtering.",
            items: { type: SchemaType.STRING },
          },
        },
        required: ["title", "body"],
      },
    },
  },
  required: ["reply", "emitInstructions"],
};

export interface ManagerChatMessage {
  role: "owner" | "assistant";
  content: string;
}

export interface ManagerTurnInput {
  promptContext: AiManagerPromptContext;
  history: ManagerChatMessage[];
  ownerMessage: string;
}

/**
 * Execute one AI-Manager turn. Throws on hard failure so the caller can
 * insert a friendly Arabic fallback assistant message.
 */
export async function runAiManagerTurn(
  input: ManagerTurnInput
): Promise<ManagerTurnResult> {
  const systemPrompt = buildAiManagerSystemPrompt(input.promptContext);

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: MANAGER_SCHEMA,
  };

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig,
  });

  // Gemini chat history: map owner -> user, assistant -> model, and drop
  // any leading non-user entries (Gemini rejects history starting on model).
  const trimmed = [...input.history];
  while (trimmed.length > 0 && trimmed[0].role !== "owner") {
    trimmed.shift();
  }
  const chatHistory = trimmed.map((m) => ({
    role: m.role === "owner" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }],
  }));

  try {
    const chat = model.startChat({
      history: chatHistory,
      systemInstruction: {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
    });
    const result = await chat.sendMessage(input.ownerMessage);
    const text = result.response.text();
    return parseManagerTurn(text);
  } catch (err) {
    // Single retry with a flat generateContent call — same JSON schema.
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("[ai-manager] chat call failed, retrying flat:", errMsg);
    try {
      const historyText = input.history
        .map(
          (m) =>
            `${m.role === "owner" ? "Owner" : "Manager"}: ${m.content}`
        )
        .join("\n");
      const flat = `${systemPrompt}\n\n${
        historyText ? `Conversation so far:\n${historyText}\n\n` : ""
      }Owner: ${input.ownerMessage}`;
      const model2 = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig,
      });
      const result = await model2.generateContent(flat);
      return parseManagerTurn(result.response.text());
    } catch (retryErr) {
      const retryMsg =
        retryErr instanceof Error ? retryErr.message : String(retryErr);
      console.error("[ai-manager] retry failed:", retryMsg);
      throw retryErr;
    }
  }
}
