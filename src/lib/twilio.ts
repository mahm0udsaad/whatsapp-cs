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
