import { NextRequest, NextResponse } from "next/server";
import { provisionRestaurantForUser } from "@/lib/onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OnboardingPayload } from "@/lib/types";

function validatePayload(payload: Partial<OnboardingPayload>) {
  if (!payload.restaurantName?.trim()) {
    return "Restaurant name is required.";
  }

  if (!payload.displayName?.trim()) {
    return "WhatsApp display name is required.";
  }

  if (!payload.agentName?.trim()) {
    return "Agent name is required.";
  }

  if (!payload.agentInstructions?.trim()) {
    return "Agent instructions are required.";
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<OnboardingPayload>;
    const validationError = validatePayload(payload);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await provisionRestaurantForUser(
      user.id,
      user.email ?? null,
      payload as OnboardingPayload
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
