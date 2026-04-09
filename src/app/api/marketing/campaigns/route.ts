import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const { data: campaigns, error } = await adminSupabaseClient
      .from("marketing_campaigns")
      .select("*, marketing_templates(id, name, approval_status, category, language)")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaigns }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const body = await request.json() as {
      name: string;
      template_id: string;
      scheduled_at?: string | null;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
    }

    if (!body.template_id) {
      return NextResponse.json({ error: "Template ID is required" }, { status: 400 });
    }

    // Validate template exists, belongs to restaurant, and is approved
    const { data: template, error: templateError } = await adminSupabaseClient
      .from("marketing_templates")
      .select("id, approval_status")
      .eq("id", body.template_id)
      .eq("restaurant_id", restaurant.id)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (template.approval_status !== "approved") {
      return NextResponse.json(
        { error: "Template must be approved before creating a campaign" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const status = body.scheduled_at ? "scheduled" : "draft";

    const { data: campaign, error } = await adminSupabaseClient
      .from("marketing_campaigns")
      .insert({
        restaurant_id: restaurant.id,
        template_id: body.template_id,
        name: body.name.trim(),
        scheduled_at: body.scheduled_at || null,
        status,
        total_recipients: 0,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        failed_count: 0,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
