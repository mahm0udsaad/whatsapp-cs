import { adminSupabaseClient } from "@/lib/supabase/admin";

export interface CreateOrderInput {
  restaurantId: string;
  conversationId: string;
  customerPhone: string;
  customerName?: string | null;
  type: "reservation" | "escalation";
  details: string;
}

export async function createOrder(input: CreateOrderInput): Promise<string | null> {
  // Prevent duplicates: if a pending order of the same type already exists
  // for this conversation, just update the details instead of inserting a new row.
  const { data: existing } = await adminSupabaseClient
    .from("orders")
    .select("id")
    .eq("conversation_id", input.conversationId)
    .eq("type", input.type)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    await adminSupabaseClient
      .from("orders")
      .update({ details: input.details, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await adminSupabaseClient
    .from("orders")
    .insert({
      restaurant_id: input.restaurantId,
      conversation_id: input.conversationId,
      customer_phone: input.customerPhone,
      customer_name: input.customerName ?? null,
      type: input.type,
      details: input.details,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[order-manager] Failed to create order:", error.message);
    return null;
  }

  return data.id;
}
