import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks must be set up before importing the module under test ---

const mockSendMessage = vi.fn();
const mockStartChat = vi.fn(() => ({ sendMessage: mockSendMessage }));
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  startChat: mockStartChat,
  generateContent: mockGenerateContent,
}));

vi.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel = mockGetGenerativeModel;
    },
  };
});

// Stub the env variable before the module-level check runs
vi.stubEnv("GOOGLE_GEMINI_API_KEY", "test-key");

// Now safe to import
const { generateNextStep } = await import("@/lib/ai-template-builder");

// --------------- Helpers ---------------

function makeRequest(
  userMessage: string,
  collectedData: Record<string, unknown> = {},
  restaurantName = "Test Restaurant"
) {
  return {
    messages: [{ role: "user" as const, content: userMessage }],
    collectedData,
    restaurantName,
  };
}

function geminiJsonResponse(payload: Record<string, unknown>) {
  return {
    response: { text: () => JSON.stringify(payload) },
  };
}

// --------------- Tests ---------------

describe("generateNextStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Returns "collecting" status with next question
  it("returns 'collecting' status with next question", async () => {
    const payload = {
      message: "What type of campaign would you like to create?",
      updatedData: {},
      status: "collecting",
    };
    mockSendMessage.mockResolvedValue(geminiJsonResponse(payload));

    const result = await generateNextStep(
      makeRequest("I want to create a marketing template")
    );

    expect(result.status).toBe("collecting");
    expect(result.message).toBe(
      "What type of campaign would you like to create?"
    );
    expect(mockStartChat).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      "I want to create a marketing template"
    );
  });

  // 2. Returns "complete" with sanitized template
  it("returns 'complete' with a template when all data collected", async () => {
    const template = {
      name: "test_promo",
      body: "Hi {{1}}, enjoy 20% off!",
      headerType: "none",
      footerText: "Reply STOP",
      buttons: [{ type: "QUICK_REPLY", title: "Order Now" }],
      variables: ["customer_name"],
      language: "en",
      category: "MARKETING",
    };
    const payload = {
      message: "Here is your template!",
      updatedData: { campaignType: "promotion" },
      status: "complete",
      template,
    };
    mockSendMessage.mockResolvedValue(geminiJsonResponse(payload));

    const result = await generateNextStep(makeRequest("Looks good, generate"));

    expect(result.status).toBe("complete");
    expect(result.template).toBeDefined();
    expect(result.template!.name).toBe("test_promo");
    expect(result.template!.body).toBe("Hi {{1}}, enjoy 20% off!");
    expect(result.template!.category).toBe("MARKETING");
  });

  // 3. Sanitizes template body over 1024 chars
  it("truncates template body longer than 1024 characters", async () => {
    const longBody = "A".repeat(1100);
    const template = {
      name: "long_body",
      body: longBody,
      headerType: "none",
      variables: ["name"],
      language: "en",
      category: "MARKETING",
    };
    const payload = {
      message: "Done!",
      updatedData: {},
      status: "complete",
      template,
    };
    mockSendMessage.mockResolvedValue(geminiJsonResponse(payload));

    const result = await generateNextStep(makeRequest("generate"));

    expect(result.template).toBeDefined();
    expect(result.template!.body.length).toBeLessThanOrEqual(1024);
    expect(result.template!.body.endsWith("...")).toBe(true);
  });

  // 4. Sanitizes template name to snake_case
  it("converts template name to snake_case", async () => {
    const template = {
      name: "My Template Name!!",
      body: "Hello {{1}}",
      headerType: "none",
      variables: ["name"],
      language: "en",
      category: "MARKETING",
    };
    const payload = {
      message: "Done!",
      updatedData: {},
      status: "complete",
      template,
    };
    mockSendMessage.mockResolvedValue(geminiJsonResponse(payload));

    const result = await generateNextStep(makeRequest("generate"));

    expect(result.template).toBeDefined();
    expect(result.template!.name).toBe("my_template_name");
  });

  // 5. Handles non-JSON Gemini response gracefully
  it("falls back to raw text when Gemini returns non-JSON", async () => {
    mockSendMessage.mockResolvedValue({
      response: {
        text: () => "Sure! Let me help you build a template.",
      },
    });

    const result = await generateNextStep(
      makeRequest("Hello, I need a template")
    );

    expect(result.status).toBe("collecting");
    expect(result.message).toBe(
      "Sure! Let me help you build a template."
    );
    expect(result.template).toBeUndefined();
  });

  // 6. Retries with generateContent on chat failure
  it("retries with generateContent when chat.sendMessage throws", async () => {
    mockSendMessage.mockRejectedValue(new Error("Chat API failed"));

    const fallbackPayload = {
      message: "What kind of campaign?",
      updatedData: {},
      status: "collecting",
    };
    mockGenerateContent.mockResolvedValue(geminiJsonResponse(fallbackPayload));

    const result = await generateNextStep(
      makeRequest("I want a promo template")
    );

    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockGenerateContent).toHaveBeenCalled();
    expect(result.status).toBe("collecting");
    expect(result.message).toBe("What kind of campaign?");
  });

  // 7. Returns error message when both attempts fail
  it("returns a graceful error when both chat and generateContent fail", async () => {
    mockSendMessage.mockRejectedValue(new Error("Chat failed"));
    mockGenerateContent.mockRejectedValue(new Error("Generate also failed"));

    const result = await generateNextStep(
      makeRequest("Create a template please")
    );

    expect(result.status).toBe("collecting");
    expect(result.message).toContain(
      "Sorry, something went wrong"
    );
    expect(result.template).toBeUndefined();
  });

  // 8. Returns prompt when last message is not from user
  it("returns prompt when last message is not from user", async () => {
    const request = {
      messages: [
        { role: "user" as const, content: "Hi" },
        { role: "assistant" as const, content: "Hello! How can I help?" },
      ],
      collectedData: {},
      restaurantName: "Test Restaurant",
    };

    const result = await generateNextStep(request);

    expect(result.status).toBe("collecting");
    expect(result.message).toBe("Please send a message to get started.");
    // Should not have called Gemini at all
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
