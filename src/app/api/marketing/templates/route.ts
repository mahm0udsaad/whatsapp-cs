import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { createContentTemplate } from "@/lib/twilio-content";
import type { TemplateCategory, TemplateHeaderType, TwilioContentTypes } from "@/lib/types";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const { data: templates, error } = await adminSupabaseClient
      .from("marketing_templates")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ templates }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

  // If there are buttons or a header, use whatsapp/card type
  if ((buttons && buttons.length > 0) || headerType !== "none") {
    const actions: Array<{
      type: "URL" | "QUICK_REPLY" | "PHONE_NUMBER" | "COPY_CODE";
      title: string;
      url?: string;
      phone?: string;
      code?: string;
      id?: string;
    }> = [];

    if (buttons && buttons.length > 0) {
      for (const btn of buttons) {
        actions.push({
          type: ((btn.type as string) || "QUICK_REPLY") as "URL" | "QUICK_REPLY" | "PHONE_NUMBER" | "COPY_CODE",
          title: btn.title as string,
          ...(btn.url ? { url: btn.url as string } : {}),
          ...(btn.phone ? { phone: btn.phone as string } : {}),
          ...(btn.code ? { code: btn.code as string } : {}),
          ...(btn.id ? { id: btn.id as string } : {}),
        });
      }
    }

    const card: NonNullable<TwilioContentTypes["whatsapp/card"]> = {
      body: bodyTemplate,
      actions,
    };

    if (headerType === "text" && headerText) {
      card.header_text = headerText;
    }

    if (headerType === "image" && imageAssetUrl) {
      card.media = [imageAssetUrl];
    }

    if (footerText) {
      card.footer = footerText;
    }

    return { "whatsapp/card": card };
  }

  // Simple text template
  return { "twilio/text": { body: bodyTemplate } };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const body = await request.json() as {
      name: string;
      body_template: string;
      language?: string;
      category?: TemplateCategory;
      header_type?: TemplateHeaderType;
      header_text?: string | null;
      footer_text?: string | null;
      buttons?: Record<string, unknown>[] | null;
      variables?: string[] | null;
      image_asset_url?: string | null;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    }

    if (!body.body_template?.trim()) {
      return NextResponse.json({ error: "Template body is required" }, { status: 400 });
    }

    const language = body.language || "en";
    const category = body.category || "MARKETING";
    const headerType = body.header_type || "none";

    // Build variables map for Twilio Content API
    const variablesMap: Record<string, string> = {};
    if (body.variables && body.variables.length > 0) {
      for (let i = 0; i < body.variables.length; i++) {
        variablesMap[`${i + 1}`] = body.variables[i];
      }
    }

    // Build Twilio content types
    const types = buildContentTypes({
      bodyTemplate: body.body_template,
      headerType,
      headerText: body.header_text,
      footerText: body.footer_text,
      buttons: body.buttons,
      imageAssetUrl: body.image_asset_url,
    });

    // Create template in Twilio Content API
    const { contentSid } = await createContentTemplate({
      friendlyName: body.name.trim(),
      language,
      variables: variablesMap,
      types: types as unknown as Record<string, unknown>,
    });

    // Insert into database
    const now = new Date().toISOString();
    const { data: template, error } = await adminSupabaseClient
      .from("marketing_templates")
      .insert({
        restaurant_id: restaurant.id,
        name: body.name.trim(),
        twilio_content_sid: contentSid,
        body_template: body.body_template,
        language,
        category,
        header_type: headerType,
        header_text: body.header_text || null,
        footer_text: body.footer_text || null,
        buttons: body.buttons || null,
        variables: body.variables || null,
        image_asset_url: body.image_asset_url || null,
        approval_status: "draft",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
