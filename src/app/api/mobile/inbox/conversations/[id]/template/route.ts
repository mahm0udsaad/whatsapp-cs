/**
 * POST /api/mobile/inbox/conversations/:id/template
 *
 * Send an approved WhatsApp template on a conversation — the only message
 * type WhatsApp accepts for a new number or after the 24h window closes.
 * Open to every active team member of the conversation's tenant.
 *
 * Ownership rules:
 *   - claimed by another agent → 409 (managers may still send);
 *   - unassigned or bot-handled → allowed, and the sender takes the
 *     conversation (human mode) so the customer's reply lands with them.
 *
 * Body: { template_id, variables?: Record<"1"|"2"|..., string> }
 * Reply: { message, claimed }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { assertAuthenticated } from "@/lib/mobile-auth";
import { sendTemplateMessage } from "@/lib/twilio-content";
import {
  renderTemplateBody,
  resolveTemplateVariables,
} from "@/lib/template-conversation";
import {
  OPTED_OUT_ERROR,
  isPhoneOptedOut,
  resolveSenderPhone,
  twilioStatusCallbackUrl,
} from "@/lib/template-send";

interface Body {
  template_id?: string;
  variables?: Record<string, unknown> | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await assertAuthenticated();
  if (authed instanceof NextResponse) return authed;
  const { user } = authed;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Body | null;
  const templateId = body?.template_id?.trim();
  if (!id || !templateId) {
    return NextResponse.json(
      { error: "id and template_id required" },
      { status: 400 }
    );
  }

  try {
    const { data: conv } = await adminSupabaseClient
      .from("conversations")
      .select("id, restaurant_id, customer_phone, customer_name, handler_mode, assigned_to")
      .eq("id", id)
      .maybeSingle();
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const restaurantId = conv.restaurant_id as string;

    const { data: member } = await adminSupabaseClient
      .from("team_members")
      .select("id, role")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!member) {
      return NextResponse.json(
        { error: "Forbidden: not a member of this tenant" },
        { status: 403 }
      );
    }
    const memberId = member.id as string;
    const isAdmin = member.role === "admin";

    if (
      conv.handler_mode === "human" &&
      conv.assigned_to !== memberId &&
      !isAdmin
    ) {
      return NextResponse.json(
        { error: "المحادثة مستلمة من موظف آخر." },
        { status: 409 }
      );
    }

    const phone = conv.customer_phone as string;
    if (await isPhoneOptedOut(restaurantId, phone)) {
      return NextResponse.json({ error: OPTED_OUT_ERROR }, { status: 409 });
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

    let customerName = (conv.customer_name as string | null) ?? null;
    if (!customerName) {
      const { data: customer } = await adminSupabaseClient
        .from("customers")
        .select("full_name")
        .eq("restaurant_id", restaurantId)
        .eq("phone_number", phone)
        .maybeSingle();
      customerName = (customer?.full_name as string | null) ?? null;
    }

    const resolved = resolveTemplateVariables({
      body: template.body_template as string | null,
      language: template.language as string | null,
      provided: body?.variables ?? null,
      customerName,
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

    let messageSid: string;
    try {
      ({ messageSid } = await sendTemplateMessage({
        contentSid: template.twilio_content_sid as string,
        contentVariables: resolved.variables,
        from: fromPhone,
        to: phone,
        statusCallback: twilioStatusCallbackUrl(),
      }));
    } catch (err) {
      const m = err instanceof Error ? err.message : "send failed";
      return NextResponse.json({ error: m }, { status: 502 });
    }

    const nowIso = new Date().toISOString();
    const { data: inserted } = await adminSupabaseClient
      .from("messages")
      .insert({
        conversation_id: conv.id,
        role: "agent",
        content: renderTemplateBody(
          template.body_template as string | null,
          resolved.variables
        ),
        message_type: "template",
        external_message_sid: messageSid,
        delivery_status: "queued",
        metadata: {
          sent_by_team_member_id: memberId,
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
    await adminSupabaseClient
      .from("conversations")
      .update({ last_message_at: nowIso, archived_at: null })
      .eq("id", conv.id);

    // Take the conversation for the sender when no human owns it.
    let claimed = false;
    if (conv.handler_mode === "unassigned") {
      // Audited first-writer-wins RPC; returns the current row either way.
      const supabase = await createServerSupabaseClient();
      const { data: row, error: claimErr } = await supabase.rpc(
        "claim_conversation",
        {
          p_conversation_id: conv.id,
          p_mode: "human",
          p_team_member_id: memberId,
        }
      );
      claimed = !claimErr && (row as { assigned_to?: string } | null)?.assigned_to === memberId;
      if (claimErr) {
        console.warn("[inbox/template] claim failed:", claimErr.message);
      }
    } else if (conv.handler_mode === "bot") {
      // The bot can't message outside the window anyway; the agent who
      // re-opened the thread owns the follow-up. Guarded against a race.
      const { data: taken } = await adminSupabaseClient
        .from("conversations")
        .update({
          handler_mode: "human",
          assigned_to: memberId,
          assigned_at: nowIso,
          assigned_by_user_id: user.id,
          bot_paused: true,
        })
        .eq("id", conv.id)
        .eq("handler_mode", "bot")
        .select("id")
        .maybeSingle();
      if (taken) {
        claimed = true;
        await adminSupabaseClient.from("conversation_claim_events").insert({
          conversation_id: conv.id,
          restaurant_id: restaurantId,
          team_member_id: memberId,
          mode: "human",
          event_type: "claim",
          claimed_by_user_id: user.id,
        });
      }
    }

    return NextResponse.json({ message: inserted, claimed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
