import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRestaurantForUserId } from "@/lib/tenant";

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
      title?: string;
      content?: string;
      source_type?: string;
    };

    if (!body.title?.trim() || !body.content?.trim()) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await adminSupabaseClient
      .from("knowledge_base")
      .insert({
        restaurant_id: restaurant.id,
        title: body.title.trim(),
        content: body.content.trim(),
        source_type: body.source_type?.trim() || "manual",
        metadata: { section: "dashboard" },
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entry: data }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
