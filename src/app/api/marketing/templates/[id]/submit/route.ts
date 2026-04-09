import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { submitForApproval } from "@/lib/twilio-content";
import type { TemplateCategory } from "@/lib/types";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const { id } = await params;

    // Fetch template
    const { data: template, error: fetchError } = await adminSupabaseClient
      .from("marketing_templates")
      .select("*")
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .single();

    if (fetchError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (template.approval_status !== "draft" && template.approval_status !== "rejected") {
      return NextResponse.json(
        { error: "Only draft or rejected templates can be submitted for approval" },
        { status: 400 }
      );
    }

    if (!template.twilio_content_sid) {
      return NextResponse.json(
        { error: "Template has no Twilio content SID. Please recreate the template." },
        { status: 400 }
      );
    }

    // Submit to WhatsApp for approval
    await submitForApproval(template.twilio_content_sid, {
      name: template.name,
      category: template.category as TemplateCategory,
    });

    const now = new Date().toISOString();

    // Update template approval status
    const { data: updatedTemplate, error: updateError } = await adminSupabaseClient
      .from("marketing_templates")
      .update({
        approval_status: "submitted",
        rejection_reason: null,
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Create approval poll entry
    const { error: pollError } = await adminSupabaseClient
      .from("template_approval_polls")
      .insert({
        template_id: id,
        restaurant_id: restaurant.id,
        twilio_content_sid: template.twilio_content_sid,
        poll_count: 0,
        next_poll_at: now,
        status: "polling",
        created_at: now,
        updated_at: now,
      });

    if (pollError) {
      console.error("Failed to create approval poll:", pollError);
      // Non-fatal - template is already submitted
    }

    return NextResponse.json({ template: updatedTemplate }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
