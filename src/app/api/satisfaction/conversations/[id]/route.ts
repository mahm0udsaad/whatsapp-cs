import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { assertRestaurantAdmin } from "@/lib/mobile-auth";
import { analyzeConversationSatisfaction } from "@/lib/customer-satisfaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "conversation id required" }, { status: 400 });
  }

  const { data: conversation, error } = await adminSupabaseClient
    .from("conversations")
    .select("id, restaurant_id, customer_name, customer_phone")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const auth = await assertRestaurantAdmin(conversation.restaurant_id as string);
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  try {
    const response = await analyzeConversationSatisfaction({
      conversation: conversation as {
        id: string;
        restaurant_id: string;
        customer_name: string | null;
        customer_phone: string;
      },
      userId: auth.user.id,
      force: body.force === true,
    });
    return NextResponse.json(response);
  } catch (analysisError) {
    const message =
      analysisError instanceof Error
        ? analysisError.message
        : "تعذّر تحليل رضا العميل.";
    console.error("[customer-satisfaction] analysis failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
