import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveAgentForRestaurant, getRestaurantForUserId } from "@/lib/tenant";

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const aiAgent = await getActiveAgentForRestaurant(restaurant.id);

    if (!aiAgent) {
      return NextResponse.json({ error: "AI agent not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      name?: string;
      personality?: string;
      system_instructions?: string;
      language_preference?: "ar" | "en" | "auto";
      off_topic_response?: string;
    };

    if (!body.name?.trim() || !body.system_instructions?.trim()) {
      return NextResponse.json(
        { error: "Agent name and system instructions are required" },
        { status: 400 }
      );
    }

    const updates = {
      name: body.name.trim(),
      personality: body.personality || aiAgent.personality,
      system_instructions: body.system_instructions.trim(),
      language_preference:
        body.language_preference || aiAgent.language_preference,
      off_topic_response:
        body.off_topic_response?.trim() || aiAgent.off_topic_response,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await adminSupabaseClient
      .from("ai_agents")
      .update(updates)
      .eq("id", aiAgent.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ aiAgent: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
