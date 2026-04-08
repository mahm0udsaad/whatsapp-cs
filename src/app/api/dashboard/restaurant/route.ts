import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRestaurantForUserId } from "@/lib/tenant";

function normalizeTimezone(country: string) {
  switch (country) {
    case "EG":
      return "Africa/Cairo";
    case "SA":
      return "Asia/Riyadh";
    case "AE":
      return "Asia/Dubai";
    case "KW":
      return "Asia/Kuwait";
    default:
      return "UTC";
  }
}

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

    const body = (await request.json()) as {
      name?: string;
      name_ar?: string | null;
      country?: string;
      currency?: string;
      website_url?: string | null;
      digital_menu_url?: string | null;
    };

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Restaurant name is required" },
        { status: 400 }
      );
    }

    const updates = {
      name: body.name.trim(),
      name_ar: body.name_ar?.trim() || null,
      country: body.country || restaurant.country,
      currency: body.currency || restaurant.currency,
      timezone: normalizeTimezone(body.country || restaurant.country),
      website_url: body.website_url?.trim() || null,
      digital_menu_url: body.digital_menu_url?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await adminSupabaseClient
      .from("restaurants")
      .update(updates)
      .eq("id", restaurant.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ restaurant: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
