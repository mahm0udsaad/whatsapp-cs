import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";

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

    const { data: campaign, error } = await adminSupabaseClient
      .from("marketing_campaigns")
      .select("*, marketing_templates(id, name, approval_status, category, language, body_template)")
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Fetch recipient stats
    const { data: recipientStats } = await adminSupabaseClient
      .from("campaign_recipients")
      .select("status")
      .eq("campaign_id", id);

    const stats = {
      total: recipientStats?.length || 0,
      pending: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
    };

    if (recipientStats) {
      for (const r of recipientStats) {
        const key = r.status as keyof typeof stats;
        if (key in stats && key !== "total") {
          stats[key]++;
        }
      }
    }

    return NextResponse.json({ campaign, recipientStats: stats }, { status: 200 });
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

    // Fetch existing campaign
    const { data: existing, error: fetchError } = await adminSupabaseClient
      .from("marketing_campaigns")
      .select("*")
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (existing.status !== "draft" && existing.status !== "scheduled") {
      return NextResponse.json(
        { error: "Only draft or scheduled campaigns can be updated" },
        { status: 400 }
      );
    }

    const body = await request.json() as {
      name?: string;
      scheduled_at?: string | null;
    };

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.scheduled_at !== undefined) {
      updates.scheduled_at = body.scheduled_at;
      updates.status = body.scheduled_at ? "scheduled" : "draft";
    }

    const { data: campaign, error } = await adminSupabaseClient
      .from("marketing_campaigns")
      .update(updates)
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campaign }, { status: 200 });
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

    const { data: existing, error: fetchError } = await adminSupabaseClient
      .from("marketing_campaigns")
      .select("*")
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft campaigns can be deleted" },
        { status: 400 }
      );
    }

    // Delete recipients first
    await adminSupabaseClient
      .from("campaign_recipients")
      .delete()
      .eq("campaign_id", id);

    // Delete campaign
    const { error } = await adminSupabaseClient
      .from("marketing_campaigns")
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
