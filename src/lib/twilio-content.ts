import { createHash } from "crypto";
import { getTwilioClient } from "@/lib/twilio";
import type { InteractiveReply, TwilioContentTypes } from "@/lib/types";

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;

const CONTENT_API_BASE = "https://content.twilio.com/v1";

function getBasicAuthHeader(): string {
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return `Basic ${credentials}`;
}

async function contentApiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${CONTENT_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Twilio Content API error (${response.status}): ${errorBody}`
    );
  }

  return response.json() as Promise<T>;
}

export async function createContentTemplate(params: {
  friendlyName: string;
  language: string;
  variables: Record<string, string>;
  types: Record<string, unknown>;
}): Promise<{ contentSid: string; dateCreated: string }> {
  const body = {
    friendly_name: params.friendlyName,
    language: params.language,
    variables: params.variables,
    types: params.types,
  };

  const result = await contentApiFetch<{ sid: string; date_created: string }>(
    "/Content",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

  return {
    contentSid: result.sid,
    dateCreated: result.date_created,
  };
}

export async function submitForApproval(
  contentSid: string,
  params: {
    name: string;
    category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  }
): Promise<{ status: string }> {
  const result = await contentApiFetch<{ status: string }>(
    `/Content/${contentSid}/ApprovalRequests/whatsapp`,
    {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        category: params.category,
      }),
    }
  );

  return { status: result.status };
}

export async function getApprovalStatus(contentSid: string): Promise<{
  status: string;
  rejectionReason?: string;
}> {
  const result = await contentApiFetch<{
    status: string;
    rejection_reason?: string;
  }>(`/Content/${contentSid}/ApprovalRequests`);

  return {
    status: result.status,
    rejectionReason: result.rejection_reason,
  };
}

export async function sendTemplateMessage(params: {
  contentSid: string;
  contentVariables: Record<string, string>;
  from: string;
  to: string;
  statusCallback: string;
}): Promise<{ messageSid: string }> {
  const client = getTwilioClient();

  const message = await client.messages.create({
    contentSid: params.contentSid,
    contentVariables: JSON.stringify(params.contentVariables),
    from: `whatsapp:${params.from}`,
    to: `whatsapp:${params.to}`,
    statusCallback: params.statusCallback,
  });

  return { messageSid: message.sid };
}

/**
 * In-process cache mapping interactive payload hash → existing Content SID.
 * Survives the lifetime of a serverless instance — good enough as a cost
 * guard so identical lists/quick-replies don't churn new Content resources.
 */
const interactiveContentCache = new Map<string, string>();

/** Visible only for tests. */
export function _resetInteractiveCacheForTests(): void {
  interactiveContentCache.clear();
}

/** Visible only for tests. */
export function _interactiveCacheSize(): number {
  return interactiveContentCache.size;
}

/**
 * Build the Twilio Content API `types` payload from a structured AI reply.
 * Returns null for `text` replies (caller should use plain sendWhatsAppMessage).
 */
export function buildInteractiveContentTypes(
  reply: InteractiveReply
): TwilioContentTypes | null {
  if (reply.type === "text") return null;

  if (reply.type === "quick_reply") {
    return {
      "twilio/quick-reply": {
        body: reply.body,
        actions: reply.options.map((o) => ({ title: o.title, id: o.id })),
      },
    };
  }

  // type === "list"
  return {
    "twilio/list-picker": {
      body: reply.body,
      button: reply.button,
      items: reply.items.map((i) => ({
        item: i.title,
        id: i.id,
        ...(i.description ? { description: i.description } : {}),
      })),
    },
  };
}

/**
 * Send a freeform interactive WhatsApp message (list-picker / quick-reply).
 *
 * Inside the 24h customer-service session window these can be created and
 * sent without Meta template approval. The function:
 *  1. Builds a Content API payload from the structured reply.
 *  2. Looks up an existing Content SID by stable hash of that payload to
 *     avoid creating duplicate Content resources for identical replies.
 *  3. On cache miss, creates a new Content (no approval submission).
 *  4. Dispatches the message via Twilio.
 *
 * Throws if reply.type === "text" — callers must branch and use the plain
 * text sender for that case.
 */
export async function sendInteractiveMessage(params: {
  reply: InteractiveReply;
  from: string;
  to: string;
  statusCallback: string;
  language?: string;
}): Promise<{
  messageSid: string;
  contentSid: string;
  cached: boolean;
  types: TwilioContentTypes;
}> {
  const types = buildInteractiveContentTypes(params.reply);
  if (!types) {
    throw new Error("sendInteractiveMessage called with text reply — use sendWhatsAppMessage instead");
  }

  const language = params.language || "en";

  // Stable hash key over the rendered Content payload + language. Identical
  // payloads in the same language reuse the same Content SID.
  const hash = createHash("sha1")
    .update(language)
    .update("\n")
    .update(JSON.stringify(types))
    .digest("hex");

  let contentSid = interactiveContentCache.get(hash);
  let cached = true;

  if (!contentSid) {
    cached = false;
    const created = await createContentTemplate({
      friendlyName: `cs-interactive-${hash.slice(0, 12)}`,
      language,
      variables: {},
      types: types as unknown as Record<string, unknown>,
    });
    contentSid = created.contentSid;
    interactiveContentCache.set(hash, contentSid);
  }

  const { messageSid } = await sendTemplateMessage({
    contentSid,
    contentVariables: {},
    from: params.from,
    to: params.to,
    statusCallback: params.statusCallback,
  });

  return { messageSid, contentSid, cached, types };
}

export async function deleteContentTemplate(contentSid: string): Promise<void> {
  const url = `${CONTENT_API_BASE}/Content/${contentSid}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: getBasicAuthHeader(),
    },
  });

  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text();
    throw new Error(
      `Twilio Content API delete error (${response.status}): ${errorBody}`
    );
  }
}
