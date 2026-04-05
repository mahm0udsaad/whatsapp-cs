import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import {
  validateTwilioRequest,
  sendWhatsAppMessage,
  generateTwiMLResponse,
} from "@/lib/twilio";
import { generateGeminiResponse } from "@/lib/gemini";
import {
  TwilioWebhookRequest,
  Conversation,
  Message,
  AiAgent,
  KnowledgeBase,
} from "@/lib/types";

interface ExtendedRequest {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
}

/**
 * Parse form data from Twilio webhook
 */
async function parseTwilioWebhook(request: NextRequest): Promise<ExtendedRequest> {
  const formData = await request.formData();
  const data: ExtendedRequest = {
    MessageSid: formData.get("MessageSid") as string,
    From: formData.get("From") as string,
    To: formData.get("To") as string,
    Body: formData.get("Body") as string,
  };
  return data;
}

/**
 * Find or create conversation for the customer
 */
async function findOrCreateConversation(
  restaurantId: string,
  customerPhone: string
): Promise<Conversation> {
  // Try to find existing conversation
  const { data: existingConversation, error: fetchError } = await adminSupabaseClient
    .from("conversations")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("customer_phone", customerPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existingConversation) {
    // Update status to active
    await adminSupabaseClient
      .from("conversations")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", existingConversation.id);

    return existingConversation;
  }

  // Create new conversation
  const { data: newConversation, error: createError } = await adminSupabaseClient
    .from("conversations")
    .insert({
      restaurant_id: restaurantId,
      customer_phone: customerPhone,
      status: "active",
      last_message_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (createError || !newConversation) {
    throw new Error(`Failed to create conversation: ${createError?.message}`);
  }

  return newConversation;
}

/**
 * Save message to database
 */
async function saveMessage(
  conversationId: string,
  sender: "customer" | "ai",
  content: string,
  language: "ar" | "en"
): Promise<Message> {
  const { data, error } = await adminSupabaseClient
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender,
      content,
      language,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to save message: ${error?.message}`);
  }

  return data;
}

/**
 * Get AI agent configuration
 */
async function getAiAgent(restaurantId: string): Promise<AiAgent> {
  const { data, error } = await adminSupabaseClient
    .from("ai_agents")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch AI agent: ${error?.message}`);
  }

  return data;
}

/**
 * Get conversation history
 */
async function getConversationHistory(
  conversationId: string,
  maxMessages: number
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const { data, error } = await adminSupabaseClient
    .from("messages")
    .select("sender, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(maxMessages);

  if (error) {
    console.error("Failed to fetch conversation history:", error);
    return [];
  }

  return (
    data?.map((msg) => ({
      role: msg.sender === "customer" ? "user" : ("assistant" as const),
      content: msg.content,
    })) || []
  );
}

/**
 * Query knowledge base using similarity search
 */
async function queryKnowledgeBase(
  restaurantId: string,
  query: string,
  limit: number = 3
): Promise<string> {
  try {
    // For now, do a simple text search since pgvector embedding might not be set up
    const { data, error } = await adminSupabaseClient
      .from("knowledge_base")
      .select("content")
      .eq("restaurant_id", restaurantId)
      .limit(limit);

    if (error) {
      console.error("Knowledge base query error:", error);
      return "";
    }

    // Filter by relevance (simple keyword matching)
    const queryWords = query.toLowerCase().split(" ");
    const relevantEntries = (data || [])
      .filter((entry) => {
        const contentLower = entry.content.toLowerCase();
        return queryWords.some((word) =>
          word.length > 2 && contentLower.includes(word)
        );
      })
      .slice(0, limit);

    return relevantEntries.map((entry) => entry.content).join("\n\n");
  } catch (error) {
    console.error("Error querying knowledge base:", error);
    return "";
  }
}

/**
 * Get menu items for context
 */
async function getMenuItemsContext(
  restaurantId: string,
  limit: number = 5
): Promise<string> {
  try {
    const { data, error } = await adminSupabaseClient
      .from("menu_items")
      .select("name, description, price, currency, category")
      .eq("restaurant_id", restaurantId)
      .eq("available", true)
      .limit(limit);

    if (error || !data) {
      return "";
    }

    const grouped = (data || []).reduce(
      (acc: Record<string, unknown[]>, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
      },
      {}
    );

    let context = "Available Menu Items:\n";
    Object.entries(grouped).forEach(([category, items]) => {
      context += `\n${category}:\n`;
      (items as unknown[]).forEach((item: any) => {
        context += `- ${item.name}: ${item.price} ${item.currency}`;
        if (item.description) context += ` (${item.description})`;
        context += "\n";
      });
    });

    return context;
  } catch (error) {
    console.error("Error fetching menu items:", error);
    return "";
  }
}

/**
 * Detect language from message
 */
function detectLanguage(text: string): "ar" | "en" {
  const arabicRegex = /[\u0600-\u06FF]/g;
  const arabicMatches = text.match(arabicRegex) || [];
  const arabicRatio = arabicMatches.length / text.length;
  return arabicRatio > 0.3 ? "ar" : "en";
}

/**
 * Main webhook handler
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get Twilio signature
    const twilioSignature = request.headers.get("x-twilio-signature") || "";

    // Get request body as text for signature validation
    const bodyText = await request.text();

    // Validate Twilio signature
    if (!validateTwilioRequest(request.url, {}, twilioSignature)) {
      console.warn("Invalid Twilio signature");
      // Still process but log warning
    }

    // Parse form data
    const params = new URLSearchParams(bodyText);
    const twilioData: ExtendedRequest = {
      MessageSid: params.get("MessageSid") || "",
      From: params.get("From") || "",
      To: params.get("To") || "",
      Body: params.get("Body") || "",
    };

    const { From, To, Body, MessageSid } = twilioData;

    if (!From || !To || !Body || !MessageSid) {
      console.error("Missing required Twilio fields", { From, To, Body, MessageSid });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Extract phone numbers (remove 'whatsapp:' prefix)
    const customerPhone = From.replace("whatsapp:", "");
    const businessPhone = To.replace("whatsapp:", "");

    console.log("Webhook received", {
      MessageSid,
      from: customerPhone,
      to: businessPhone,
      body: Body.substring(0, 50),
    });

    // Look up restaurant by business phone number
    const { data: restaurant, error: restaurantError } = await adminSupabaseClient
      .from("restaurants")
      .select("*")
      .eq("whatsapp_number", businessPhone)
      .single();

    if (restaurantError || !restaurant) {
      console.error("Restaurant not found for phone:", businessPhone);
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    // Find or create conversation
    const conversation = await findOrCreateConversation(
      restaurant.id,
      customerPhone
    );

    // Save incoming message
    const userLanguage = detectLanguage(Body);
    await saveMessage(conversation.id, "customer", Body, userLanguage);

    // Get AI agent config
    const aiAgent = await getAiAgent(restaurant.id);

    // Get conversation history
    const conversationHistory = await getConversationHistory(
      conversation.id,
      aiAgent.max_context_messages || 10
    );

    // Query knowledge base
    const ragContext = await queryKnowledgeBase(restaurant.id, Body);

    // Get menu items context
    const menuContext = await getMenuItemsContext(restaurant.id);

    // Build RAG context
    const fullRagContext = [
      ragContext,
      menuContext,
    ]
      .filter((c) => c.trim().length > 0)
      .join("\n\n");

    // Generate AI response
    let aiResponse: string;
    let responseLanguage: "ar" | "en" = userLanguage;

    try {
      const geminiResult = await generateGeminiResponse({
        systemPrompt: aiAgent.system_prompt,
        personality: aiAgent.personality,
        ragContext: fullRagContext,
        conversationHistory,
        userMessage: Body,
        languagePreference: aiAgent.language_preference || "auto",
        offTopicResponse: aiAgent.off_topic_response,
      });

      aiResponse = geminiResult.content;
      responseLanguage = geminiResult.language;
    } catch (error) {
      console.error("Gemini API error:", error);
      // Fallback response
      aiResponse =
        responseLanguage === "ar"
          ? "عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة لاحقاً."
          : "Sorry, there was an error processing your request. Please try again later.";
    }

    // Save AI response
    await saveMessage(conversation.id, "ai", aiResponse, responseLanguage);

    // Update conversation last_message_at
    await adminSupabaseClient
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // Send message via Twilio
    try {
      const messageSid = await sendWhatsAppMessage(customerPhone, aiResponse);
      console.log("Message sent via Twilio", { messageSid });
    } catch (error) {
      console.error("Failed to send Twilio message:", error);
    }

    // Return TwiML response
    const twimlResponse = generateTwiMLResponse(aiResponse);

    return new NextResponse(twimlResponse, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
      },
    });
  } catch (error) {
    console.error("Webhook error:", error);

    // Return error TwiML
    const errorMessage =
      "عذراً، حدث خطأ. يرجى المحاولة لاحقاً. / Sorry, an error occurred. Please try again later.";
    const twimlResponse = generateTwiMLResponse(errorMessage);

    return new NextResponse(twimlResponse, {
      status: 500,
      headers: {
        "Content-Type": "application/xml",
      },
    });
  }
}
