import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiResponse } from "./types";

const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Missing GOOGLE_GEMINI_API_KEY environment variable");
}

const genAI = new GoogleGenerativeAI(apiKey);

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface GeminiContext {
  systemPrompt: string;
  personality: string;
  ragContext: string;
  conversationHistory: ConversationMessage[];
  userMessage: string;
  languagePreference: "ar" | "en" | "auto";
  offTopicResponse: string;
}

/**
 * Detect language of a message
 */
function detectLanguage(text: string): "ar" | "en" {
  // Arabic character ranges
  const arabicRegex = /[\u0600-\u06FF]/g;
  const arabicMatches = text.match(arabicRegex) || [];
  const arabicRatio = arabicMatches.length / text.length;

  return arabicRatio > 0.3 ? "ar" : "en";
}

/**
 * Check if message is clearly off-topic (e.g. asking about politics, coding, etc.)
 * We use a permissive approach: allow everything EXCEPT clearly unrelated topics.
 * Greetings, general questions, and anything that could relate to the business are allowed.
 */
async function isOffTopic(
  message: string,
  ragContext: string
): Promise<boolean> {
  // If RAG context is available, message is on-topic
  if (ragContext.trim().length > 50) {
    return false;
  }

  // Short messages (greetings, etc.) are always on-topic
  if (message.trim().length < 30) {
    return false;
  }

  // Clearly off-topic keywords (things that have nothing to do with a restaurant)
  const offTopicKeywords = [
    "bitcoin", "crypto", "stock market", "programming", "code",
    "politics", "election", "war", "hack", "password",
  ];

  const lowerMessage = message.toLowerCase();
  return offTopicKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );
}

/**
 * Generate a response using Google Gemini
 */
export async function generateGeminiResponse(
  context: GeminiContext
): Promise<GeminiResponse> {
  try {
    // Detect user message language
    const userLanguage = detectLanguage(context.userMessage);

    // Determine response language based on preference and user input
    let responseLanguage: "ar" | "en" = userLanguage;
    if (context.languagePreference !== "auto") {
      responseLanguage = context.languagePreference;
    }

    // Only block clearly off-topic messages
    const offTopic = await isOffTopic(
      context.userMessage,
      context.ragContext
    );

    if (offTopic) {
      return {
        content: context.offTopicResponse,
        language: responseLanguage,
      };
    }

    // Build the prompt
    let systemPrompt = context.systemPrompt;
    systemPrompt += `\n\nPersonality: ${context.personality}`;

    if (context.ragContext.trim()) {
      systemPrompt += `\n\nRelevant Information:\n${context.ragContext}`;
    }

    systemPrompt += `\n\nRespond in ${responseLanguage === "ar" ? "Arabic" : "English"} language.`;
    systemPrompt += "\nBe concise, helpful, and maintain a professional yet friendly tone.";

    // Get the model
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Convert conversation history to chat format
    const chatHistory = context.conversationHistory.map((msg) => ({
      role: msg.role === "user" ? "user" : ("model" as const),
      parts: [{ text: msg.content }],
    }));

    // Add current user message
    const allMessages = [
      ...chatHistory,
      {
        role: "user" as const,
        parts: [{ text: context.userMessage }],
      },
    ];

    // Start chat session
    const chat = model.startChat({
      history: allMessages.slice(0, -1),
      systemInstruction: systemPrompt,
    });

    // Send message and get response
    const result = await chat.sendMessage(context.userMessage);
    const responseText = result.response.text();

    return {
      content: responseText,
      language: responseLanguage,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : "";
    console.error("Error generating Gemini response:", errMsg);
    console.error("Stack:", errStack);

    // Retry once with a simpler approach if the chat-based call fails
    try {
      console.log("[gemini] Retrying with simple generateContent...");
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const simplePrompt = `${context.systemPrompt}\n\nRelevant info:\n${context.ragContext}\n\nCustomer message: ${context.userMessage}\n\nRespond in ${detectLanguage(context.userMessage) === "ar" ? "Arabic" : "English"}. Be helpful and friendly.`;
      const result = await model.generateContent(simplePrompt);
      const responseText = result.response.text();
      return {
        content: responseText,
        language: detectLanguage(context.userMessage),
      };
    } catch (retryError: unknown) {
      const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
      console.error("Gemini retry also failed:", retryMsg);
      throw retryError;
    }
  }
}

/**
 * Validate API key is configured
 */
export function validateGeminiConfig(): boolean {
  return !!apiKey;
}
