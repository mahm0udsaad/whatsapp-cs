/**
 * Intent Classifier
 *
 * After the AI generates a reply, this runs a lightweight Gemini call to detect
 * whether the conversation contains a reservation request or an escalation
 * (something the AI couldn't confidently answer).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export type OrderIntent = "reservation" | "escalation" | "none";

export interface ClassifiedIntent {
  intent: OrderIntent;
  /** Extracted reservation details (date, time, service, name) OR the unknown question */
  details: string;
}

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Classifies the latest exchange to detect if:
 *  - reservation: customer has provided enough details to create a booking request
 *  - escalation: AI indicated it doesn't know something and the customer needs a human reply
 *  - none: normal exchange, no action needed
 */
export async function classifyIntent(
  userMessage: string,
  aiReply: string,
  history: ConversationTurn[]
): Promise<ClassifiedIntent> {
  const recentHistory = history.slice(-6);

  const historyText = recentHistory
    .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.content}`)
    .join("\n");

  const prompt = `You are a classification engine. Analyze this WhatsApp customer service exchange and output ONLY valid JSON.

CONVERSATION:
${historyText}
Customer: ${userMessage}
Agent: ${aiReply}

RULES:
- "reservation": The customer has provided the key details needed for a booking (service or what they want, and at least a date OR time). The agent has acknowledged it or asked a clarifying question.
- "escalation": The agent's reply signals they don't have the answer (phrases like "سأتحقق", "I'll check", "I don't have that information", "سيتواصل معك فريقنا", "our team will get back to you", etc.) and the customer asked a genuine question.
- "none": Normal exchange — greeting, simple factual answer, order tracking, etc.

If "reservation", extract ALL booking details mentioned (service, date, time, customer name if given) as a concise Arabic or English summary.
If "escalation", extract the customer's unanswered question as-is.
If "none", set details to "".

Output ONLY this JSON (no markdown, no explanation):
{"intent":"reservation"|"escalation"|"none","details":"..."}`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    // Strip any markdown code fences just in case
    const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(jsonStr) as ClassifiedIntent;

    if (!["reservation", "escalation", "none"].includes(parsed.intent)) {
      return { intent: "none", details: "" };
    }

    return { intent: parsed.intent, details: parsed.details || "" };
  } catch {
    // Classification failure is non-fatal — default to no action
    return { intent: "none", details: "" };
  }
}
