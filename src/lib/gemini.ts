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
 * Check if message is restaurant-related
 */
async function isRestaurantRelated(
  message: string,
  ragContext: string
): Promise<boolean> {
  // If RAG context is available and relevant, message is likely on-topic
  if (ragContext.trim().length > 50) {
    return true;
  }

  // Common restaurant-related keywords in Arabic and English
  const restaurantKeywords = [
    // English
    "menu",
    "order",
    "food",
    "drink",
    "price",
    "delivery",
    "reservation",
    "booking",
    "table",
    "dish",
    "cuisine",
    "restaurant",
    "opening hours",
    "hours",
    "location",
    "address",
    "phone",
    "available",
    "recommended",
    "special",
    "promotion",
    "discount",
    "deal",
    "offer",
    "allergy",
    "ingredient",
    "vegetarian",
    "vegan",
    "spicy",
    "payment",
    "card",
    "cash",
    // Arabic
    "القائمة",
    "طلب",
    "طعام",
    "شراب",
    "سعر",
    "توصيل",
    "حجز",
    "طاولة",
    "طبق",
    "مطبخ",
    "مطعم",
    "ساعات",
    "موقع",
    "عنوان",
    "هاتف",
    "متوفر",
    "موصى",
    "خاص",
    "عرض",
    "خصم",
    "صفقة",
    "حساسية",
    "مكون",
    "نباتي",
    "حار",
    "دفع",
    "بطاقة",
  ];

  const lowerMessage = message.toLowerCase();
  return restaurantKeywords.some((keyword) =>
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

    // Check if the message is restaurant-related
    const onTopic = await isRestaurantRelated(
      context.userMessage,
      context.ragContext
    );

    if (!onTopic) {
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
  } catch (error) {
    console.error("Error generating Gemini response:", error);
    throw error;
  }
}

/**
 * Validate API key is configured
 */
export function validateGeminiConfig(): boolean {
  return !!apiKey;
}
