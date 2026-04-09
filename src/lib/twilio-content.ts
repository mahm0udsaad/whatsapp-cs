import { getTwilioClient } from "@/lib/twilio";

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
