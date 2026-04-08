import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRestaurantForUserId } from "@/lib/tenant";

function detectCurrencyFromCountry(country: string) {
  switch (country) {
    case "EG":
      return "EGP";
    case "SA":
      return "SAR";
    case "AE":
      return "AED";
    case "KW":
      return "KWD";
    default:
      return "USD";
  }
}

export async function POST(request: NextRequest) {
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
      name_en?: string;
      description_en?: string;
      price?: number;
      category?: string;
      is_available?: boolean;
    };

    if (!body.name_en?.trim() || typeof body.price !== "number") {
      return NextResponse.json(
        { error: "Name and price are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await adminSupabaseClient
      .from("menu_items")
      .insert({
        restaurant_id: restaurant.id,
        name_en: body.name_en.trim(),
        name_ar: null,
        description_en: body.description_en?.trim() || null,
        description_ar: null,
        price: body.price,
        discounted_price: null,
        currency: restaurant.currency || detectCurrencyFromCountry(restaurant.country),
        category: body.category?.trim() || "General",
        subcategory: null,
        image_url: null,
        is_available: body.is_available ?? true,
        sort_order: 0,
        crawled_at: null,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
