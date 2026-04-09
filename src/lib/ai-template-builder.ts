import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AITemplateBuilderRequest,
  AITemplateBuilderResponse,
  AITemplateCollectedData,
  TemplateCategory,
  TemplateHeaderType,
} from "./types";

const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Missing GOOGLE_GEMINI_API_KEY environment variable");
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Detect whether the user is writing in Arabic
 */
function detectLanguage(text: string): "ar" | "en" {
  const arabicRegex = /[\u0600-\u06FF]/g;
  const arabicMatches = text.match(arabicRegex) || [];
  const arabicRatio = arabicMatches.length / text.replace(/\s/g, "").length;
  return arabicRatio > 0.3 ? "ar" : "en";
}

/**
 * Build the system prompt that instructs Gemini how to behave
 * as the WhatsApp marketing template builder assistant.
 */
function buildSystemPrompt(
  restaurantName: string,
  collectedData: AITemplateCollectedData
): string {
  const dataSnapshot = JSON.stringify(collectedData, null, 2);

  return `You are a friendly WhatsApp marketing template assistant helping "${restaurantName}" create a professional WhatsApp marketing message template.

Your job is to ask the user questions ONE AT A TIME to gather the information needed, then generate a WhatsApp-compliant template.

## Conversation Flow

Follow these steps in order. Skip any step where the data is already collected.

1. **Campaign Type** (field: campaignType) - Ask what kind of campaign:
   - Promotion / Discount (e.g., "20% off this weekend")
   - New Item Announcement (e.g., "Try our new burger!")
   - Event / Occasion (e.g., "Ramadan special menu")
   - Feedback / Review Request (e.g., "How was your last visit?")

2. **Main Message** (field: mainMessage) - Ask them to describe the main offer or message in their own words. Encourage them to be specific (mention dish names, percentages, dates, etc.).

3. **Language** (field: language) - Ask if the template should be in Arabic or English. If the user has been chatting in Arabic, suggest Arabic. If in English, suggest English.

4. **Image Header** (field: includeImage) - Ask if they want an eye-catching image at the top of the message. If yes, ask what the image should show (field: imagePrompt) - e.g., "a delicious plate of grilled chicken with rice".

5. **Call-to-Action Buttons** (field: buttons) - Ask if they want buttons at the bottom. Options:
   - Quick Reply buttons (up to 3) - e.g., "Order Now", "View Menu", "Call Us"
   - URL button (up to 2) - buttons that open a link
   - Or no buttons at all
   If they want buttons, ask for button titles (max 25 characters each) and URLs if applicable.

6. **Footer** (field: footerText) - Ask if they want a short footer (max 60 chars) like "Reply STOP to unsubscribe" or the restaurant name.

7. **Generate** - Once all data is collected, generate the complete template.

## Already Collected Data
${dataSnapshot}

## Response Format

You MUST respond with valid JSON only. No markdown, no extra text. Use this exact structure:

{
  "message": "Your conversational message to the user (can be Arabic or English)",
  "updatedData": { /* only include fields that changed or are newly collected */ },
  "status": "collecting" | "complete"
}

When status is "complete", also include a "template" field:

{
  "message": "Here is your template! ...",
  "updatedData": { ... },
  "status": "complete",
  "template": {
    "name": "snake_case_template_name",
    "body": "Template body text with {{1}} {{2}} numbered variables for personalization",
    "headerType": "none" | "text" | "image",
    "headerText": "optional header text",
    "footerText": "optional footer",
    "buttons": [{ "type": "QUICK_REPLY" | "URL", "title": "Button Title", "url": "https://..." }],
    "variables": ["customer_name", "discount_amount"],
    "language": "ar" | "en",
    "category": "MARKETING",
    "imagePrompt": "detailed image generation prompt if includeImage is true"
  }
}

## WhatsApp Template Rules (MUST follow)
- Template body: max 1024 characters
- Variables use {{1}}, {{2}}, ... numbered format (NOT named variables)
- Footer: max 60 characters
- Button titles: max 25 characters each
- Maximum 3 Quick Reply buttons OR 2 URL buttons (not both types mixed)
- Template name: snake_case, only lowercase letters, numbers, underscores, max 512 chars
- The first variable {{1}} should typically be the customer's name for personalization
- Category is almost always "MARKETING" for promotional templates

## Behavioral Rules
- Ask ONE question at a time. Be concise and friendly.
- If the user gives a vague answer, ask a gentle follow-up for clarity.
- If the user wants to change a previous answer, update the data accordingly.
- If the user writes in Arabic, respond in Arabic.
- If the user writes in English, respond in English.
- If the user says they are done or wants to skip remaining steps, generate the template with what you have (use sensible defaults for missing fields).
- Always be encouraging - restaurant owners may not be technical.
- When generating the template body, make it professional, engaging, and appropriate for WhatsApp marketing.
- Include appropriate emojis in the template body to make it visually appealing.`;
}

/**
 * Parse Gemini's JSON response, handling common formatting issues.
 */
function parseGeminiJson(text: string): {
  message: string;
  updatedData: Partial<AITemplateCollectedData>;
  status: "collecting" | "complete";
  template?: AITemplateBuilderResponse["template"];
} {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // If parsing fails, treat the entire response as a message
    console.warn("[ai-template-builder] Failed to parse Gemini JSON, using raw text");
    return {
      message: text.trim(),
      updatedData: {},
      status: "collecting",
    };
  }
}

/**
 * Merge the existing collected data with any updates from Gemini.
 */
function mergeCollectedData(
  existing: AITemplateCollectedData,
  updates: Partial<AITemplateCollectedData>
): AITemplateCollectedData {
  return {
    ...existing,
    ...updates,
  };
}

/**
 * Validate and sanitize the generated template to ensure WhatsApp compliance.
 */
function sanitizeTemplate(
  template: NonNullable<AITemplateBuilderResponse["template"]>,
  restaurantName: string
): NonNullable<AITemplateBuilderResponse["template"]> {
  // Enforce body length
  let body = template.body || "";
  if (body.length > 1024) {
    body = body.substring(0, 1021) + "...";
  }

  // Enforce footer length
  let footerText = template.footerText || "";
  if (footerText.length > 60) {
    footerText = footerText.substring(0, 60);
  }

  // Enforce button title length and count
  let buttons = template.buttons || [];
  buttons = buttons.map((btn) => ({
    ...btn,
    title: btn.title.length > 25 ? btn.title.substring(0, 25) : btn.title,
  }));

  const quickReplies = buttons.filter((b) => b.type === "QUICK_REPLY");
  const urlButtons = buttons.filter((b) => b.type === "URL");
  if (quickReplies.length > 3) {
    buttons = [...quickReplies.slice(0, 3), ...urlButtons];
  }
  if (urlButtons.length > 2) {
    buttons = [...quickReplies, ...urlButtons.slice(0, 2)];
  }

  // Sanitize template name
  let name = template.name || "";
  name = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!name) {
    const slug = restaurantName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    name = `${slug}_marketing_template`;
  }
  if (name.length > 512) {
    name = name.substring(0, 512);
  }

  // Ensure valid category
  const validCategories: TemplateCategory[] = ["MARKETING", "UTILITY", "AUTHENTICATION"];
  const category = validCategories.includes(template.category)
    ? template.category
    : "MARKETING";

  // Ensure valid headerType
  const validHeaders: TemplateHeaderType[] = ["none", "text", "image"];
  const headerType = validHeaders.includes(template.headerType)
    ? template.headerType
    : "none";

  return {
    ...template,
    name,
    body,
    footerText: footerText || undefined,
    buttons: buttons.length > 0 ? buttons : undefined,
    category,
    headerType,
    variables: template.variables || [],
    language: template.language === "ar" ? "ar" : "en",
  };
}

/**
 * Core AI template builder function.
 *
 * Takes the conversation history and collected data so far,
 * sends them to Gemini, and returns the next step in the flow.
 */
export async function generateNextStep(
  request: AITemplateBuilderRequest
): Promise<AITemplateBuilderResponse> {
  const { messages, collectedData, restaurantName } = request;

  const systemPrompt = buildSystemPrompt(restaurantName, collectedData);

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // Convert messages to Gemini chat format
  const chatHistory = messages.slice(0, -1).map((msg) => ({
    role: msg.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: msg.content }],
  }));

  // The latest user message
  const latestMessage = messages[messages.length - 1];
  if (!latestMessage || latestMessage.role !== "user") {
    return {
      message: "Please send a message to get started.",
      collectedData,
      status: "collecting",
    };
  }

  // Detect user language for fallback
  const userLanguage = detectLanguage(latestMessage.content);

  try {
    const chat = model.startChat({
      history: chatHistory,
      systemInstruction: {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
    });

    const result = await chat.sendMessage(latestMessage.content);
    const responseText = result.response.text();

    const parsed = parseGeminiJson(responseText);

    // Merge collected data
    const updatedData = mergeCollectedData(collectedData, parsed.updatedData);

    // If complete and template is provided, sanitize it
    let template = parsed.template;
    if (parsed.status === "complete" && template) {
      template = sanitizeTemplate(template, restaurantName);
    }

    return {
      message: parsed.message,
      collectedData: updatedData,
      status: parsed.status,
      template: template || undefined,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[ai-template-builder] Gemini call failed:", errMsg);

    // Retry with a simpler generateContent approach
    try {
      console.log("[ai-template-builder] Retrying with simple generateContent...");

      const conversationText = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const fallbackPrompt = `${systemPrompt}\n\n## Conversation So Far\n${conversationText}\n\nRespond with the next JSON step.`;

      const fallbackResult = await model.generateContent(fallbackPrompt);
      const fallbackText = fallbackResult.response.text();
      const parsed = parseGeminiJson(fallbackText);

      const updatedData = mergeCollectedData(collectedData, parsed.updatedData);

      let template = parsed.template;
      if (parsed.status === "complete" && template) {
        template = sanitizeTemplate(template, restaurantName);
      }

      return {
        message: parsed.message,
        collectedData: updatedData,
        status: parsed.status,
        template: template || undefined,
      };
    } catch (retryError: unknown) {
      const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
      console.error("[ai-template-builder] Retry also failed:", retryMsg);

      // Return a graceful error message
      const errorMessage =
        userLanguage === "ar"
          ? "عذراً، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى."
          : "Sorry, something went wrong while processing your request. Please try again.";

      return {
        message: errorMessage,
        collectedData,
        status: "collecting",
      };
    }
  }
}
