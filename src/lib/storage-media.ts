/**
 * WhatsApp media storage helpers.
 *
 * Handles all interactions with the `whatsapp-media` Supabase Storage bucket:
 *   - Downloading inbound media from Twilio (Basic-auth, size-capped).
 *   - Uploading buffers into the tenant/conversation path convention.
 *   - Creating short-lived signed URLs so the dashboard (and Twilio, for
 *     outbound media sends) can fetch private objects.
 *
 * Path convention:
 *   <restaurantId>/<conversationId>/<YYYY>/<MM>/<id>.<ext>
 *
 * NO external deps — ULIDs are hand-rolled using crypto.randomUUID.
 */

import { randomUUID } from "crypto";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

/** 20 MB hard cap on inbound Twilio media downloads. */
export const MAX_INBOUND_MEDIA_BYTES = 20 * 1024 * 1024;

/** Download fetch timeout for Twilio media (ms). */
export const TWILIO_MEDIA_DOWNLOAD_TIMEOUT_MS = 15_000;

/**
 * Extension lookup from content-type. Kept small and opinionated — covers
 * what WhatsApp actually sends (images, audio, video, PDF, common docs) and
 * falls back to "bin" for anything unexpected.
 */
const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "audio/ogg": "ogg",
  "audio/ogg; codecs=opus": "ogg",
  "audio/opus": "opus",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/csv": "csv",
};

export function extFromContentType(contentType: string): string {
  const ct = (contentType || "").toLowerCase().split(";")[0].trim();
  return CONTENT_TYPE_TO_EXT[ct] || "bin";
}

/**
 * Map a MIME type to our messages.message_type enum-ish values.
 *   image/*        -> image
 *   audio/ogg      -> voice  (WhatsApp voice notes)
 *   audio/*        -> audio
 *   video/*        -> video
 *   application/*  -> document
 *   anything else  -> file
 */
export function messageTypeFromContentType(contentType: string): string {
  const ct = (contentType || "").toLowerCase().split(";")[0].trim();
  if (ct.startsWith("image/")) return "image";
  if (ct === "audio/ogg" || ct === "audio/opus") return "voice";
  if (ct.startsWith("audio/")) return "audio";
  if (ct.startsWith("video/")) return "video";
  if (
    ct === "application/pdf" ||
    ct === "application/msword" ||
    ct ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ct === "application/vnd.ms-excel" ||
    ct ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ct === "text/plain" ||
    ct === "text/csv"
  ) {
    return "document";
  }
  return "file";
}

/**
 * Arabic/English caption placeholder for each media kind. Used when the
 * customer sends media without a text Body — the AI still gets a meaningful
 * content field.
 */
export function placeholderCaptionFor(messageType: string): string {
  switch (messageType) {
    case "image":
      return "[صورة]";
    case "voice":
      return "[ملف صوتي]";
    case "audio":
      return "[ملف صوتي]";
    case "video":
      return "[فيديو]";
    case "document":
      return "[مستند]";
    default:
      return "[ملف]";
  }
}

/**
 * Hand-rolled short id (Crockford-ish, 26 chars) used as the object filename.
 * We derive it from crypto.randomUUID so we don't add any npm deps.
 */
function generateObjectId(): string {
  const uuid = randomUUID().replace(/-/g, "");
  const tsPart = Date.now().toString(36);
  return `${tsPart}${uuid.slice(0, 18)}`;
}

export function buildMediaStoragePath(params: {
  restaurantId: string;
  conversationId: string;
  contentType: string;
  objectId?: string;
}): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = extFromContentType(params.contentType);
  const id = params.objectId || generateObjectId();
  return `${params.restaurantId}/${params.conversationId}/${yyyy}/${mm}/${id}.${ext}`;
}

/**
 * Download a Twilio media URL with Basic auth. Enforces a 15s timeout and the
 * 20MB cap. Throws on failure; returns the buffer + content-type + size on
 * success.
 */
export async function downloadTwilioMedia(
  twilioUrl: string
): Promise<{ buffer: Buffer; contentType: string; sizeBytes: number }> {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  if (!sid || !token) {
    throw new Error("Twilio credentials missing (ACCOUNT_SID / AUTH_TOKEN)");
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    TWILIO_MEDIA_DOWNLOAD_TIMEOUT_MS
  );

  let response: Response;
  try {
    response = await fetch(twilioUrl, {
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(
      `Twilio media fetch failed: ${response.status} ${response.statusText}`
    );
  }

  // Some Twilio media endpoints advertise the length up front; use it to
  // short-circuit oversized downloads.
  const declaredLen = Number(response.headers.get("content-length") || "0");
  if (declaredLen && declaredLen > MAX_INBOUND_MEDIA_BYTES) {
    throw new Error(
      `Media too large: ${declaredLen} bytes > ${MAX_INBOUND_MEDIA_BYTES}`
    );
  }

  const contentType =
    response.headers.get("content-type") || "application/octet-stream";

  const arrayBuf = await response.arrayBuffer();
  const sizeBytes = arrayBuf.byteLength;
  if (sizeBytes > MAX_INBOUND_MEDIA_BYTES) {
    throw new Error(
      `Media too large: ${sizeBytes} bytes > ${MAX_INBOUND_MEDIA_BYTES}`
    );
  }

  return {
    buffer: Buffer.from(arrayBuf),
    contentType,
    sizeBytes,
  };
}

/**
 * Upload a buffer we already have in memory into the whatsapp-media bucket
 * using the tenant/conversation path convention. Returns the storage path and
 * the size we uploaded.
 */
export async function uploadInboundMedia(params: {
  restaurantId: string;
  conversationId: string;
  contentType: string;
  buffer: Buffer;
  originalFilename?: string;
}): Promise<{ storagePath: string; sizeBytes: number }> {
  if (params.buffer.byteLength > MAX_INBOUND_MEDIA_BYTES) {
    throw new Error(
      `uploadInboundMedia: buffer too large (${params.buffer.byteLength} bytes)`
    );
  }

  const storagePath = buildMediaStoragePath({
    restaurantId: params.restaurantId,
    conversationId: params.conversationId,
    contentType: params.contentType,
  });

  const { error } = await adminSupabaseClient.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(storagePath, params.buffer, {
      contentType: params.contentType,
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    throw new Error(`storage upload failed: ${error.message}`);
  }

  return { storagePath, sizeBytes: params.buffer.byteLength };
}

/**
 * Create a short-lived signed URL for a stored media object. Default TTL is
 * 1 hour — plenty for Twilio to fetch it during an outbound media send and
 * for the dashboard to render it in the inspector.
 */
export async function createMediaSignedUrl(
  storagePath: string,
  ttlSeconds = 3600
): Promise<string> {
  const { data, error } = await adminSupabaseClient.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to create signed URL: ${error?.message || "no signedUrl returned"}`
    );
  }

  return data.signedUrl;
}

/**
 * Parse a path like `<restaurantId>/<conversationId>/…` — used when we need
 * to validate that the caller has access before returning a signed URL.
 */
export function parseMediaStoragePath(storagePath: string): {
  restaurantId: string | null;
  conversationId: string | null;
} {
  const parts = (storagePath || "").split("/");
  return {
    restaurantId: parts[0] || null,
    conversationId: parts[1] || null,
  };
}
