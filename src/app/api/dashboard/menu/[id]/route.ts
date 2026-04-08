import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRestaurantForUserId } from "@/lib/tenant";

async function getScopedRestaurant() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized", status: 401 as const, restaurant: null };
  }

  const restaurant = await getRestaurantForUserId(user.id);

  if (!restaurant) {
    return {
      error: "Restaurant not found",
      status: 404 as const,
      restaurant: null,
    };
  }

  return { restaurant, error: null, status: 200 as const };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await getScopedRestaurant();

    if (!scope.restaurant) {
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }

    const { id } = await params;
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

    const { data, error } = await adminSupabaseClient
      .from("menu_items")
      .update({
        name_en: body.name_en.trim(),
        description_en: body.description_en?.trim() || null,
        price: body.price,
        category: body.category?.trim() || "General",
        is_available: body.is_available ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("restaurant_id", scope.restaurant.id)
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const scope = await getScopedRestaurant();

    if (!scope.restaurant) {
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }

    const { id } = await params;

    const { error } = await adminSupabaseClient
      .from("menu_items")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", scope.restaurant.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
