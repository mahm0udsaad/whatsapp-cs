/**
 * POST /api/mobile/conversations/start-with-template
 *
 * Manager-only. Opens (or reuses) a conversation with any phone number by
 * sending an approved WhatsApp template — the only message type WhatsApp
 * allows outside the 24h customer-service window.
 *
 * Body: {
 *   phone_number: string (E.164),
 *   template_id: string,
 *   variables?: Record<"1"|"2"|..., string>,   // {{1}} falls back to name
 *   customer_name?: string | null
 * }
 * Reply: { conversation_id, is_new, message, claimed }
 *
 * Side effects (all tenant-scoped):
 *   - upserts the number into `customers` (source 'manual') so it shows in
 *     the directory and future campaign audiences;
 *   - persists the sent template as an agent message on the conversation;
 *   - claims the conversation for the caller when nobody owns it yet, so the
 *     customer's reply lands with them instead of the shared queue / bot.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { findOrCreateConversationForPhone } from "@/lib/conversations";
import { sendTemplateMessage } from "@/lib/twilio-content";
import {
  renderTemplateBody,
  resolveTemplateVariables,
} from "@/lib/template-conversation";

const E164 = /^\+[1-9]\d{1,14}$/;

interface Body {
  phone_number?: string;
  template_id?: string;
  variables?: Record<string, unknown> | null;
  customer_name?: string | null;
}

function statusCallbackUrl(): string {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
  return `${appUrl}/api/webhooks/twilio/status`;
}

async function resolveSenderPhone(restaurantId: string): Promise<string | null> {
  try {
    const { data: sender } = await adminSupabaseClient
      .from("whatsapp_senders")
      .select("phone_number")
      .eq("restaurant_id", restaurantId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (sender?.phone_number) return sender.phone_number as string;
  } catch {
    // whatsapp_senders may not exist yet; fall through.
  }
  const { data: restaurant } = await adminSupabaseClient
    .from("restaurants")
    .select("twilio_phone_number")
    .eq("id", restaurantId)
    .maybeSingle();
  return (
    (restaurant?.twilio_phone_number as string | null) ||
    process.env.TWILIO_PHONE_NUMBER ||
    null
  );
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId, teamMember, user } = ctx;

  const body = (await request.json().catch(() => null)) as Body | null;
  const phone = body?.phone_number?.trim();
  const templateId = body?.template_id?.trim();
  const customerName = body?.customer_name?.trim().slice(0, 120) || null;

  if (!phone || !E164.test(phone)) {
    return NextResponse.json(
      { error: "رقم الهاتف يجب أن يكون بصيغة دولية مثل ‎+9665XXXXXXXX" },
      { status: 400 }
    );
  }
  if (!templateId) {
    return NextResponse.json({ error: "template_id required" }, { status: 400 });
  }

  try {
    // Opt-out gate — either source of truth blocks the send.
    const [{ data: customer }, { data: optOut }] = await Promise.all([
      adminSupabaseClient
        .from("customers")
        .select("id, full_name, opted_out")
        .eq("restaurant_id", restaurantId)
        .eq("phone_number", phone)
        .maybeSingle(),
      adminSupabaseClient
        .from("opt_outs")
        .select("phone_number")
        .eq("restaurant_id", restaurantId)
        .eq("phone_number", phone)
        .limit(1)
        .maybeSingle(),
    ]);
    if (customer?.opted_out || optOut) {
      return NextResponse.json(
        { error: "هذا العميل ألغى الاشتراك في الرسائل ولا يمكن مراسلته." },
        { status: 409 }
      );
    }

    const { data: template } = await adminSupabaseClient
      .from("marketing_templates")
      .select("id, name, body_template, language, approval_status, twilio_content_sid")
      .eq("id", templateId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    if (template.approval_status !== "approved" || !template.twilio_content_sid) {
      return NextResponse.json(
        { error: "القالب غير معتمد من واتساب بعد." },
        { status: 409 }
      );
    }

    const resolved = resolveTemplateVariables({
      body: template.body_template as string | null,
      language: template.language as string | null,
      provided: body?.variables ?? null,
      customerName: customerName || (customer?.full_name as string | null) || null,
    });
    if (!resolved.ok) {
      return NextResponse.json(
        {
          error: `يرجى تعبئة المتغيرات: ${resolved.missing
            .map((i) => `{{${i}}}`)
            .join("، ")}`,
          missing: resolved.missing,
        },
        { status: 400 }
      );
    }

    const fromPhone = await resolveSenderPhone(restaurantId);
    if (!fromPhone) {
      return NextResponse.json(
        { error: "لا يوجد رقم واتساب مفعّل لهذا المطعم." },
        { status: 409 }
      );
    }

    // Keep the directory in sync: create the customer, or fill a missing name.
    const nowIso = new Date().toISOString();
    if (!customer) {
      await adminSupabaseClient.from("customers").upsert(
        {
          restaurant_id: restaurantId,
          phone_number: phone,
          full_name: customerName,
          source: "manual",
          updated_at: nowIso,
        },
        { onConflict: "restaurant_id,phone_number", ignoreDuplicates: true }
      );
    } else if (customerName && !customer.full_name) {
      await adminSupabaseClient
        .from("customers")
        .update({ full_name: customerName, updated_at: nowIso })
        .eq("id", customer.id as string);
    }

    const conv = await findOrCreateConversationForPhone(restaurantId, phone);

    let messageSid: string;
    try {
      ({ messageSid } = await sendTemplateMessage({
        contentSid: template.twilio_content_sid as string,
        contentVariables: resolved.variables,
        from: fromPhone,
        to: phone,
        statusCallback: statusCallbackUrl(),
      }));
    } catch (err) {
      const m = err instanceof Error ? err.message : "send failed";
      return NextResponse.json(
        { error: m, conversation_id: conv.id },
        { status: 502 }
      );
    }

    const content = renderTemplateBody(
      template.body_template as string | null,
      resolved.variables
    );
    const { data: inserted } = await adminSupabaseClient
      .from("messages")
      .insert({
        conversation_id: conv.id,
        role: "agent",
        content,
        message_type: "template",
        external_message_sid: messageSid,
        delivery_status: "queued",
        metadata: {
          sent_by_team_member_id: teamMember?.id ?? null,
          sent_by_user_id: user.id,
          template: {
            id: template.id,
            name: template.name,
            content_sid: template.twilio_content_sid,
            variables: resolved.variables,
          },
        },
        created_at: nowIso,
      })
      .select("*")
      .single();

    // Un-archive so the restarted thread is visible in the inbox again.
    const conversationPatch: Record<string, unknown> = {
      last_message_at: nowIso,
      archived_at: null,
    };
    if (customerName) conversationPatch.customer_name = customerName;
    await adminSupabaseClient
      .from("conversations")
      .update(conversationPatch)
      .eq("id", conv.id)
      .eq("restaurant_id", restaurantId);

    // Claim for the sender when nobody owns it, via the audited RPC
    // (first-writer-wins, so a concurrent claim simply wins).
    let claimed = false;
    if (teamMember) {
      const { data: current } = await adminSupabaseClient
        .from("conversations")
        .select("handler_mode")
        .eq("id", conv.id)
        .maybeSingle();
      if (current?.handler_mode === "unassigned") {
        const supabase = await createServerSupabaseClient();
        const { error: claimErr } = await supabase.rpc("claim_conversation", {
          p_conversation_id: conv.id,
          p_mode: "human",
          p_team_member_id: teamMember.id,
        });
        claimed = !claimErr;
        if (claimErr) {
          console.warn("[start-with-template] claim failed:", claimErr.message);
        }
      }
    }

    return NextResponse.json({
      conversation_id: conv.id,
      is_new: conv.is_new,
      message: inserted,
      claimed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
