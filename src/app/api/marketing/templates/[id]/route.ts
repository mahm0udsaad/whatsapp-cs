import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { deleteContentTemplate } from "@/lib/twilio-content";

export async function GET(
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

    const { data: template, error } = await adminSupabaseClient
      .from("marketing_templates")
      .select("*")
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .single();

    if (error || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ template }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
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

    // Fetch existing template
    const { data: existing, error: fetchError } = await adminSupabaseClient
      .from("marketing_templates")
      .select("*")
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (existing.approval_status !== "draft" && existing.approval_status !== "rejected") {
      return NextResponse.json(
        { error: "Only draft or rejected templates can be edited" },
        { status: 400 }
      );
    }

    const body = await request.json() as {
      name?: string;
      body_template?: string;
      language?: string;
      category?: string;
      header_type?: string;
      header_text?: string | null;
      footer_text?: string | null;
      buttons?: Record<string, unknown>[] | null;
      variables?: string[] | null;
      image_asset_url?: string | null;
    };

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.body_template !== undefined) updates.body_template = body.body_template;
    if (body.language !== undefined) updates.language = body.language;
    if (body.category !== undefined) updates.category = body.category;
    if (body.header_type !== undefined) updates.header_type = body.header_type;
    if (body.header_text !== undefined) updates.header_text = body.header_text;
    if (body.footer_text !== undefined) updates.footer_text = body.footer_text;
    if (body.buttons !== undefined) updates.buttons = body.buttons;
    if (body.variables !== undefined) updates.variables = body.variables;
    if (body.image_asset_url !== undefined) updates.image_asset_url = body.image_asset_url;

    const { data: template, error } = await adminSupabaseClient
      .from("marketing_templates")
      .update(updates)
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
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

    // Fetch existing template
    const { data: existing, error: fetchError } = await adminSupabaseClient
      .from("marketing_templates")
      .select("*")
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (existing.approval_status !== "draft" && existing.approval_status !== "rejected") {
      return NextResponse.json(
        { error: "Only draft or rejected templates can be deleted" },
        { status: 400 }
      );
    }

    // Delete from Twilio if it has a content SID
    if (existing.twilio_content_sid) {
      try {
        await deleteContentTemplate(existing.twilio_content_sid);
      } catch (err) {
        console.error("Failed to delete Twilio content template:", err);
        // Continue with DB deletion even if Twilio delete fails
      }
    }

    const { error } = await adminSupabaseClient
      .from("marketing_templates")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", restaurant.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
