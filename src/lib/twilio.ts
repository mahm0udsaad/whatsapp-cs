import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid) {
  throw new Error("Missing TWILIO_ACCOUNT_SID environment variable");
}

if (!authToken) {
  throw new Error("Missing TWILIO_AUTH_TOKEN environment variable");
}

if (!twilioPhoneNumber) {
  throw new Error("Missing TWILIO_PHONE_NUMBER environment variable");
}

const client = twilio(accountSid, authToken);

interface SendWhatsAppMessageOptions {
  fromPhoneNumber?: string;
  mediaUrl?: string;
  statusCallback?: string;
}

/**
 * Send a WhatsApp message via Twilio
 */
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  options: SendWhatsAppMessageOptions = {}
): Promise<string> {
  try {
    const messageData: {
      from: string;
      to: string;
      body: string;
      mediaUrl?: string[];
      statusCallback?: string;
    } = {
      from: `whatsapp:${options.fromPhoneNumber || twilioPhoneNumber}`,
      to: `whatsapp:${to}`,
      body,
    };

    if (options.mediaUrl) {
      messageData.mediaUrl = [options.mediaUrl];
    }

    if (options.statusCallback) {
      messageData.statusCallback = options.statusCallback;
    }

    const message = await client.messages.create(messageData);
    return message.sid;
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
    throw error;
  }
}

export interface SendWhatsAppMediaOptions {
  fromPhoneNumber?: string;
  statusCallback?: string;
  /** Single media URL. If both `mediaUrl` and `mediaUrls` are set, both lists are merged. */
  mediaUrl?: string;
  /** Up to 10 media URLs (Twilio WhatsApp limit). */
  mediaUrls?: string[];
  /** Optional text caption to send alongside the media. */
  caption?: string;
}

/**
 * Send a WhatsApp message with one or more media attachments via Twilio.
 * Media URLs must be publicly reachable by Twilio (use a signed Storage URL).
 * Returns the Twilio messageSid.
 */
export async function sendWhatsAppMedia(
  to: string,
  options: SendWhatsAppMediaOptions
): Promise<string> {
  try {
    const merged: string[] = [];
    if (options.mediaUrl) merged.push(options.mediaUrl);
    if (options.mediaUrls && options.mediaUrls.length > 0) {
      merged.push(...options.mediaUrls);
    }
    if (merged.length === 0) {
      throw new Error("sendWhatsAppMedia: at least one mediaUrl is required");
    }
    if (merged.length > 10) {
      throw new Error("sendWhatsAppMedia: Twilio allows at most 10 media URLs");
    }

    const messageData: {
      from: string;
      to: string;
      body: string;
      mediaUrl: string[];
      statusCallback?: string;
    } = {
      from: `whatsapp:${options.fromPhoneNumber || twilioPhoneNumber}`,
      to: `whatsapp:${to}`,
      body: options.caption || "",
      mediaUrl: merged,
    };

    if (options.statusCallback) {
      messageData.statusCallback = options.statusCallback;
    }

    const message = await client.messages.create(messageData);
    return message.sid;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Twilio media error";
    console.error("Error sending WhatsApp media:", error);
    throw new Error(`sendWhatsAppMedia failed: ${message}`);
  }
}

/**
 * Validate incoming Twilio request using signature verification
 */
export function validateTwilioRequest(
  url: string,
  body: Record<string, string>,
  twilioSignature: string
): boolean {
  try {
    return twilio.validateRequest(authToken || "", twilioSignature, url, body);
  } catch (error) {
    console.error("Error validating Twilio signature:", error);
    return false;
  }
}

/**
 * Generate TwiML response
 */
export function generateTwiMLResponse(message: string): string {
  // Escape XML special characters
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escaped}</Message>
</Response>`;
}

/**
 * Get Twilio client for testing/advanced operations
 */
export function getTwilioClient() {
  return client;
}

/**
 * Validate Twilio configuration
 */
export function validateTwilioConfig(): boolean {
  return !!(accountSid && authToken && twilioPhoneNumber);
}
