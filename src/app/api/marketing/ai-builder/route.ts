import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRestaurantForUserId } from "@/lib/tenant";
import { generateNextStep } from "@/lib/ai-template-builder";
import type { AITemplateBuilderRequest } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);

    if (!restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    // 2. Parse and validate request body
    const body = (await request.json()) as Partial<AITemplateBuilderRequest>;

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate each message has the required shape
    for (const msg of body.messages) {
      if (!msg.role || !msg.content || !["user", "assistant"].includes(msg.role)) {
        return NextResponse.json(
          { error: "Each message must have a valid role ('user' | 'assistant') and content" },
          { status: 400 }
        );
      }
    }

    const builderRequest: AITemplateBuilderRequest = {
      messages: body.messages,
      collectedData: body.collectedData || {},
      restaurantName: restaurant.name,
    };

    // 3. Call AI builder
    const response = await generateNextStep(builderRequest);

    // 4. Return response
    return NextResponse.json(response);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[api/marketing/ai-builder] Error:", errMsg);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
