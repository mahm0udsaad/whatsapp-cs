import { NextRequest, NextResponse } from "next/server";
import { provisionRestaurantForUser } from "@/lib/onboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OnboardingPayload } from "@/lib/types";

const E164_RE = /^\+[1-9]\d{6,14}$/;

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

  if (!payload.botPhoneNumber?.trim()) {
    return "Bot phone number is required.";
  }

  if (!E164_RE.test(payload.botPhoneNumber.trim())) {
    return "Bot phone number must be in international format (e.g. +966542228723).";
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

    // Provisioning gate (App Store Review Guidelines 3.1.1 / 3.1.3(c)).
    //
    // Self-serve provisioning is NOT allowed: the service is provided only to
    // businesses verified by the Nehgz team after signing the commercial
    // agreement. Authentication alone (including Google sign-in, which
    // auto-creates a user) must NOT grant the service. The team sets
    // app_metadata.provisioning_approved = true on the user when they provision
    // the account; everyone else is refused here so an individual/consumer
    // cannot self-activate a workspace.
    const approvedFlag = user.app_metadata?.provisioning_approved;
    const approved = approvedFlag === true || approvedFlag === "true";

    if (!approved) {
      return NextResponse.json(
        {
          error:
            "حسابك غير مُفعَّل للتجهيز الذاتي. نِحجز بوت خدمة للأعمال التجارية تُجهَّز يدوياً بعد التحقق من النشاط. تواصل مع فريق المبيعات لتفعيل حسابك.",
          code: "provisioning_not_approved",
        },
        { status: 403 }
      );
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
