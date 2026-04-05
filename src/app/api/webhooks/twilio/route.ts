import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage, generateTwiMLResponse } from "@/lib/twilio";
import { generateGeminiResponse } from "@/lib/gemini";

interface TwilioPayload {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
}

/** Parse form-encoded Twilio webhook body */
function parseTwilioBody(bodyText: string): TwilioPayload {
  const params = new URLSearchParams(bodyText);
  return {
    MessageSid: params.get("MessageSid") || "",
    From: params.get("From") || "",
    To: params.get("To") || "",
    Body: params.get("Body") || "",
  };
}

/** Find or create a conversation for this customer */
async function findOrCreateConversation(restaurantId: string, customerPhone: string) {
  const { data: existing } = await adminSupabaseClient
    .from("conversations")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("customer_phone", customerPhone)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    await adminSupabaseClient
      .from("conversations")
      .update({ status: "active", last_message_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing;
  }

  const { data: created, error } = await adminSupabaseClient
    .from("conversations")
    .insert({
      restaurant_id: restaurantId,
      customer_phone: customerPhone,
      status: "active",
      started_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !created) throw new Error(`Failed to create conversation: ${error?.message}`);
  return created;
}

/** Save a message to the DB */
async function saveMessage(conversationId: string, role: "user" | "assistant", content: string) {
  const { error } = await adminSupabaseClient
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      message_type: "text",
      created_at: new Date().toISOString(),
    });
  if (error) console.error("Failed to save message:", error.message);
}

/** Get conversation history */
async function getConversationHistory(conversationId: string, limit = 10) {
  const { data } = await adminSupabaseClient
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  return (data || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

/** Query knowledge base for relevant context */
async function queryKnowledgeBase(restaurantId: string, query: string): Promise<string> {
  try {
    const { data } = await adminSupabaseClient
      .from("knowledge_base")
      .select("content")
      .eq("restaurant_id", restaurantId)
      .limit(5);

    if (!data?.length) return "";

    const queryWords = query.toLowerCase().split(" ").filter((w) => w.length > 2);
    const relevant = data.filter((entry) => {
      const lower = entry.content.toLowerCase();
      return queryWords.some((word) => lower.includes(word));
    });

    return relevant.map((e) => e.content).join("\n\n");
  } catch {
    return "";
  }
}

/** Get menu items as context string */
async function getMenuContext(restaurantId: string): Promise<string> {
  try {
    const { data } = await adminSupabaseClient
      .from("menu_items")
      .select("name, description, price, currency, category")
      .eq("restaurant_id", restaurantId)
      .eq("available", true)
      .limit(20);

    if (!data?.length) return "";

    const grouped = data.reduce((acc: Record<string, typeof data>, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});

    let ctx = "Available Menu:\n";
    for (const [category, items] of Object.entries(grouped)) {
      ctx += `\n${category}:\n`;
      for (const item of items) {
        ctx += `- ${item.name}: ${item.price} ${item.currency}`;
        if (item.description) ctx += ` (${item.description})`;
        ctx += "\n";
      }
    }
    return ctx;
  } catch {
    return "";
  }
}

/** Detect language from Arabic Unicode */
function detectLanguage(text: string): "ar" | "en" {
  const arabicMatches = (text.match(/[\u0600-\u06FF]/g) || []).length;
  return arabicMatches / text.length > 0.3 ? "ar" : "en";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const bodyText = await request.text();
    const { MessageSid, From, To, Body } = parseTwilioBody(bodyText);

    if (!From || !To || !Body || !MessageSid) {
      console.error("Missing required Twilio fields");
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Strip whatsapp: prefix
    const customerPhone = From.replace("whatsapp:", "");
    const businessPhone = To.replace("whatsapp:", "");

    console.log(`[webhook] From: ${customerPhone} | To: ${businessPhone} | Body: ${Body.substring(0, 60)}`);

    // Look up restaurant by twilio_phone_number
    const { data: restaurant, error: restaurantError } = await adminSupabaseClient
      .from("restaurants")
      .select("*")
      .eq("twilio_phone_number", businessPhone)
      .single();

    if (restaurantError || !restaurant) {
      console.error(`[webhook] No restaurant found for phone: ${businessPhone}`);
      // Send a fallback message so user knows the system received their message
      const fallback = detectLanguage(Body) === "ar"
        ? "مرحباً! الخدمة غير متاحة حالياً. يرجى المحاولة لاحقاً."
        : "Hello! This service is not configured yet. Please try again later.";
      await sendWhatsAppMessage(customerPhone, fallback).catch(() => {});
      return new NextResponse(generateTwiMLResponse(fallback), {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    // Find or create conversation
    const conversation = await findOrCreateConversation(restaurant.id, customerPhone);

    // Save incoming message
    await saveMessage(conversation.id, "user", Body);

    // Get AI agent config
    const { data: aiAgent } = await adminSupabaseClient
      .from("ai_agents")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("is_active", true)
      .single();

    if (!aiAgent) {
      console.error(`[webhook] No active AI agent for restaurant: ${restaurant.id}`);
      const msg = detectLanguage(Body) === "ar"
        ? "مرحباً! المساعد الذكي غير متاح حالياً."
        : "Hello! The AI assistant is not configured yet.";
      await saveMessage(conversation.id, "assistant", msg);
      await sendWhatsAppMessage(customerPhone, msg).catch(() => {});
      return new NextResponse(generateTwiMLResponse(msg), {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    // Get conversation history
    const history = await getConversationHistory(conversation.id, 10);

    // Build RAG context
    const ragContext = await queryKnowledgeBase(restaurant.id, Body);
    const menuContext = await getMenuContext(restaurant.id);
    const fullContext = [ragContext, menuContext].filter((c) => c.trim()).join("\n\n");

    // Generate AI response
    let aiResponse: string;
    const userLang = detectLanguage(Body);

    try {
      const result = await generateGeminiResponse({
        systemPrompt: aiAgent.system_instructions || `You are a helpful customer service assistant for ${restaurant.name} restaurant.`,
        personality: aiAgent.personality || "friendly",
        ragContext: fullContext,
        conversationHistory: history.slice(0, -1), // exclude the message we just saved
        userMessage: Body,
        languagePreference: (aiAgent.language_preference as "ar" | "en" | "auto") || "auto",
        offTopicResponse: aiAgent.off_topic_response || (userLang === "ar"
          ? "عذراً، أنا متخصص فقط في الإجابة على أسئلة المطعم."
          : "Sorry, I can only answer questions about the restaurant."),
      });
      aiResponse = result.content;
    } catch (err) {
      console.error("[webhook] Gemini error:", err);
      aiResponse = userLang === "ar"
        ? "عذراً، حدث خطأ. يرجى المحاولة لاحقاً."
        : "Sorry, an error occurred. Please try again later.";
    }

    // Save AI response & update conversation
    await saveMessage(conversation.id, "assistant", aiResponse);
    await adminSupabaseClient
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // Send reply via Twilio
    await sendWhatsAppMessage(customerPhone, aiResponse).catch((e) =>
      console.error("[webhook] Failed to send Twilio message:", e)
    );

    return new NextResponse(generateTwiMLResponse(aiResponse), {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("[webhook] Unhandled error:", error);
    const msg = "عذراً، حدث خطأ. / Sorry, an error occurred.";
    return new NextResponse(generateTwiMLResponse(msg), {
      status: 500,
      headers: { "Content-Type": "application/xml" },
    });
  }
}
