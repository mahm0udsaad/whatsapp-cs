/**
 * GET  /api/mobile/marketing/templates
 *   default: returns only approved templates (used by campaign-create flow)
 *   ?status=all : returns every template for the tenant (used by the
 *                 templates library screen with status tabs)
 *
 * POST /api/mobile/marketing/templates
 *   Create a template from a preset + filled fields. Optionally submits it
 *   to WhatsApp/Meta for approval in the same call (default: submit=true).
 *
 *   Body:
 *     name, body_template, language, category,
 *     header_type ('none'|'text'|'image'),
 *     header_text?, header_image_url?, footer_text?,
 *     buttons?, variables?, submit? (default true)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { createContentTemplate, submitForApproval } from "@/lib/twilio-content";
import { processPendingTemplateApprovalPolls } from "@/lib/template-approval-poller";
import type {
  TemplateCategory,
  TemplateHeaderType,
  TwilioContentTypes,
} from "@/lib/types";

export async function GET(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const status = request.nextUrl.searchParams.get("status");
  const wantAll = status === "all";

  let q = adminSupabaseClient
    .from("marketing_templates")
    .select(
      "id, name, category, language, body_template, header_type, header_text, header_image_url, footer_text, buttons, variables, approval_status, rejection_reason, created_at, updated_at"
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  if (!wantAll) q = q.eq("approval_status", "approved");

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Lazy-refresh approval status for any `submitted` rows (free piggy-back
  // on every library load so the tabs stay fresh without a dedicated cron).
  if (wantAll && (data ?? []).some((t) => t.approval_status === "submitted")) {
    processPendingTemplateApprovalPolls().catch((e) =>
      console.error("[mobile/templates] lazy poll error:", e)
    );
  }

  return NextResponse.json(data ?? []);
}

interface CreateBody {
  name?: string;
  body_template?: string;
  language?: string;
  category?: TemplateCategory;
  header_type?: TemplateHeaderType;
  header_text?: string | null;
  header_image_url?: string | null;
  footer_text?: string | null;
  buttons?: Record<string, unknown>[] | null;
  variables?: string[] | null;
  sample_values?: string[] | null;
  submit?: boolean;
}

/**
 * Meta requires the submission `name` to be lowercase ASCII letters, digits
 * and underscores, ≤512 chars. The user-visible template name is Arabic, so
 * we derive a safe slug here and append a short random suffix to avoid
 * collisions across resubmits.
 */
function metaSafeTemplateName(userName: string): string {
  const ascii = userName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const base = ascii || "template";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}_${suffix}`;
}

/** Return null if the button set is valid; otherwise an error message. */
function validateButtons(
  buttons: Record<string, unknown>[] | null | undefined
): string | null {
  if (!buttons || buttons.length === 0) return null;
  if (buttons.length > 3) return "Maximum of 3 buttons allowed";

  const kinds = new Set(buttons.map((b) => (b.type as string) || "QUICK_REPLY"));
  const hasQR = kinds.has("QUICK_REPLY");
  const hasCta = kinds.has("URL") || kinds.has("PHONE_NUMBER");
  if (hasQR && hasCta) {
    return "Cannot mix QUICK_REPLY with URL/PHONE_NUMBER buttons";
  }

  const urlCount = buttons.filter((b) => b.type === "URL").length;
  const phoneCount = buttons.filter((b) => b.type === "PHONE_NUMBER").length;
  if (urlCount > 2) return "Maximum of 2 URL buttons allowed";
  if (phoneCount > 1) return "Maximum of 1 PHONE_NUMBER button allowed";

  for (const b of buttons) {
    if (!(b.title as string)?.trim()) return "Button title is required";
    if (b.type === "URL" && !(b.url as string)?.trim()) {
      return "URL button requires url";
    }
    if (b.type === "PHONE_NUMBER" && !(b.phone as string)?.trim()) {
      return "PHONE_NUMBER button requires phone";
    }
  }
  return null;
}

function buildContentTypes(params: {
  bodyTemplate: string;
  headerType: TemplateHeaderType;
  headerText?: string | null;
  footerText?: string | null;
  buttons?: Record<string, unknown>[] | null;
  imageAssetUrl?: string | null;
}): TwilioContentTypes {
  const { bodyTemplate, headerType, headerText, footerText, buttons, imageAssetUrl } = params;

  if ((buttons && buttons.length > 0) || headerType !== "none") {
    const actions: Array<{
      type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER";
      title: string;
      url?: string;
      phone?: string;
      id?: string;
    }> = [];

    if (buttons && buttons.length > 0) {
      for (const btn of buttons) {
        actions.push({
          type: ((btn.type as string) || "QUICK_REPLY") as
            | "URL"
            | "QUICK_REPLY"
            | "PHONE_NUMBER",
          title: btn.title as string,
          ...(btn.url ? { url: btn.url as string } : {}),
          ...(btn.phone ? { phone: btn.phone as string } : {}),
          ...(btn.id ? { id: btn.id as string } : {}),
        });
      }
    }

    const card: NonNullable<TwilioContentTypes["whatsapp/card"]> = {
      body: bodyTemplate,
      actions,
    };

    if (headerType === "text" && headerText) card.header_text = headerText;
    if (headerType === "image" && imageAssetUrl) card.media = [imageAssetUrl];
    if (footerText) card.footer = footerText;

    return { "whatsapp/card": card };
  }

  return { "twilio/text": { body: bodyTemplate } };
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Template name is required" }, { status: 400 });
  }
  if (!body.body_template?.trim()) {
    return NextResponse.json({ error: "Template body is required" }, { status: 400 });
  }

  const language = body.language || "ar";
  const category: TemplateCategory = body.category || "MARKETING";
  const headerType: TemplateHeaderType = body.header_type || "none";

  // AUTHENTICATION uses `whatsapp/authentication` content type (OTP shape),
  // not `whatsapp/card`. This route is wired for MARKETING/UTILITY only.
  if (category === "AUTHENTICATION") {
    return NextResponse.json(
      { error: "AUTHENTICATION category is not supported by this endpoint" },
      { status: 400 }
    );
  }

  if (headerType === "image" && !body.header_image_url) {
    return NextResponse.json(
      { error: "Image header requires header_image_url" },
      { status: 400 }
    );
  }

  const buttonError = validateButtons(body.buttons);
  if (buttonError) {
    return NextResponse.json({ error: buttonError }, { status: 400 });
  }

  // Twilio's `variables` map must carry realistic filled-in values for Meta
  // review, not parameter-name placeholders. Prefer explicit sample_values
  // from the client; fall back to the variable labels for backward compat.
  const sampleSource =
    body.sample_values && body.sample_values.length > 0
      ? body.sample_values
      : body.variables ?? [];
  const variablesMap: Record<string, string> = {};
  for (let i = 0; i < sampleSource.length; i++) {
    variablesMap[`${i + 1}`] = sampleSource[i];
  }

  const types = buildContentTypes({
    bodyTemplate: body.body_template,
    headerType,
    headerText: body.header_text,
    footerText: body.footer_text,
    buttons: body.buttons,
    imageAssetUrl: body.header_image_url,
  });

  let contentSid: string;
  try {
    const r = await createContentTemplate({
      friendlyName: body.name.trim(),
      language,
      variables: variablesMap,
      types: types as unknown as Record<string, unknown>,
    });
    contentSid = r.contentSid;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Twilio create failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const now = new Date().toISOString();
  const shouldSubmit = body.submit !== false;

  const { data: template, error } = await adminSupabaseClient
    .from("marketing_templates")
    .insert({
      restaurant_id: restaurantId,
      name: body.name.trim(),
      twilio_content_sid: contentSid,
      body_template: body.body_template,
      language,
      category,
      header_type: headerType,
      header_text: body.header_text || null,
      header_image_url: body.header_image_url || null,
      footer_text: body.footer_text || null,
      buttons: body.buttons || null,
      variables: body.variables || null,
      approval_status: "draft",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !template) {
    return NextResponse.json(
      { error: error?.message || "Failed to insert template" },
      { status: 500 }
    );
  }

  if (!shouldSubmit) {
    return NextResponse.json({ template }, { status: 201 });
  }

  try {
    // Meta's template name must be lowercase ASCII + underscores — derive a
    // safe slug from the user-visible (often Arabic) name.
    await submitForApproval(contentSid, {
      name: metaSafeTemplateName(template.name),
      category,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Twilio submit failed";
    // Template row is created; surface the submit error so the caller can retry.
    return NextResponse.json(
      { template, submit_error: msg },
      { status: 202 }
    );
  }

  const submittedAt = new Date().toISOString();
  const { data: updated } = await adminSupabaseClient
    .from("marketing_templates")
    .update({
      approval_status: "submitted",
      rejection_reason: null,
      updated_at: submittedAt,
    })
    .eq("id", template.id)
    .select("*")
    .single();

  await adminSupabaseClient.from("template_approval_polls").insert({
    template_id: template.id,
    restaurant_id: restaurantId,
    twilio_content_sid: contentSid,
    poll_count: 0,
    next_poll_at: submittedAt,
    status: "polling",
    created_at: submittedAt,
    updated_at: submittedAt,
  });

  return NextResponse.json({ template: updated ?? template }, { status: 201 });
}
