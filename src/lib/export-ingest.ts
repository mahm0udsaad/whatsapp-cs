/**
 * Persist a wa-export ZIP archive into our live tables so the exported WhatsApp
 * history shows up in the dashboard (المحادثات + العملاء) even before the
 * client connects a number of their own.
 *
 * For each NON-group 1:1 chat in the archive we:
 *   - upsert a `customers` row (العملاء page),
 *   - find-or-create the `conversations` row (same helper the live webhook uses),
 *   - insert each message into `messages` (role customer/agent), de-duplicated by
 *     the WhatsApp message id stored in `external_message_sid` so re-running is safe,
 *   - upload any media/voice note into the private `whatsapp-media` bucket and
 *     reference it in `metadata.media[]` exactly like inbound Twilio media.
 *
 * Groups, broadcasts, status and chats without a usable phone number are skipped.
 */

import { unzipSync } from "fflate";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { findOrCreateConversationForPhone } from "@/lib/conversations";
import {
  WHATSAPP_MEDIA_BUCKET,
  buildMediaStoragePath,
  messageTypeFromContentType,
  placeholderCaptionFor,
} from "@/lib/storage-media";

interface ZipMediaRef {
  file?: string;
  mimetype?: string | null;
  filename?: string | null;
  bytes?: number;
  isVoice?: boolean;
  skipped?: string;
}

interface ZipMsg {
  id: string;
  timestamp: number | null; // WhatsApp epoch SECONDS
  fromMe: boolean;
  type: string;
  body: string;
  hasMedia: boolean;
  media?: ZipMediaRef;
}

interface ZipChat {
  chatId: string;
  name: string | null;
  isGroup: boolean;
  number: string | null;
  messages: ZipMsg[];
}

interface MessageInsert {
  conversation_id: string;
  role: "customer" | "agent" | "system";
  content: string;
  message_type: string;
  metadata: Record<string, unknown>;
  external_message_sid: string | null;
  delivery_status: string;
  channel: string;
  created_at: string;
}

export interface IngestResult {
  chatsImported: number;
  skippedGroups: number;
  skippedNoNumber: number;
  customersUpserted: number;
  messagesInserted: number;
  mediaUploaded: number;
  mediaSkipped: number;
}

const E164 = /^\+[1-9]\d{1,14}$/;
const NON_1TO1 = /(@g\.us|@broadcast|@newsletter)$|^status@/i;
const decoder = new TextDecoder();

/** Normalize a WhatsApp contact number / chatId into strict E.164, or null. */
function toE164(number: string | null, chatId: string): string | null {
  let digits = (number || "").replace(/\D/g, "");
  if (!digits) {
    const m = /^(\d+)@c\.us$/.exec(chatId || "");
    if (m) digits = m[1];
  }
  if (!digits) return null;
  const e164 = `+${digits}`;
  return E164.test(e164) ? e164 : null;
}

const iso = (tsSeconds: number): string => new Date(tsSeconds * 1000).toISOString();

export async function ingestExportZip(params: {
  restaurantId: string;
  exportId: string;
  zip: Buffer | Uint8Array;
}): Promise<IngestResult> {
  const { restaurantId, exportId } = params;
  const files = unzipSync(
    params.zip instanceof Buffer ? new Uint8Array(params.zip) : params.zip
  );

  const result: IngestResult = {
    chatsImported: 0,
    skippedGroups: 0,
    skippedNoNumber: 0,
    customersUpserted: 0,
    messagesInserted: 0,
    mediaUploaded: 0,
    mediaSkipped: 0,
  };

  const chats: ZipChat[] = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (!path.startsWith("chats/") || !path.endsWith(".json")) continue;
    try {
      chats.push(JSON.parse(decoder.decode(bytes)) as ZipChat);
    } catch {
      /* skip malformed chat file */
    }
  }

  for (const chat of chats) {
    if (chat.isGroup || NON_1TO1.test(chat.chatId || "")) {
      result.skippedGroups += 1;
      continue;
    }
    const phone = toE164(chat.number, chat.chatId);
    if (!phone) {
      result.skippedNoNumber += 1;
      continue;
    }

    // Keep only real content (text or media); drop system notifications.
    const msgs = (chat.messages || [])
      .filter((m) => (m.body && m.body.trim()) || m.hasMedia)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    if (msgs.length === 0) continue;

    const conv = await findOrCreateConversationForPhone(restaurantId, phone);

    // De-dupe against messages already stored for this conversation (only a
    // pre-existing conversation can have any).
    const seen = new Set<string>();
    if (!conv.is_new) {
      const { data } = await adminSupabaseClient
        .from("messages")
        .select("external_message_sid")
        .eq("conversation_id", conv.id)
        .not("external_message_sid", "is", null)
        .limit(10000);
      for (const r of data || []) {
        if (r.external_message_sid) seen.add(r.external_message_sid as string);
      }
    }

    const customerName = chat.name || null;
    const lastTs = msgs[msgs.length - 1].timestamp;
    await adminSupabaseClient.from("customers").upsert(
      {
        restaurant_id: restaurantId,
        phone_number: phone,
        full_name: customerName,
        source: "conversation",
        source_ref: exportId,
        last_seen_at: lastTs ? iso(lastTs) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id,phone_number" }
    );
    result.customersUpserted += 1;

    if (customerName) {
      await adminSupabaseClient
        .from("conversations")
        .update({ customer_name: customerName })
        .eq("id", conv.id)
        .is("customer_name", null);
    }

    const rows: MessageInsert[] = [];
    let maxTs = 0;
    let maxInboundTs = 0;
    let minTs = Number.MAX_SAFE_INTEGER;

    for (const m of msgs) {
      if (m.id && seen.has(m.id)) continue;
      const ts = m.timestamp || null;
      if (ts) {
        maxTs = Math.max(maxTs, ts);
        minTs = Math.min(minTs, ts);
        if (!m.fromMe) maxInboundTs = Math.max(maxInboundTs, ts);
      }

      let messageType = "text";
      let content = m.body || "";
      const metadata: Record<string, unknown> = { imported: true, export_id: exportId };

      const media = m.media;
      if (media && media.file && files[media.file]) {
        const contentType = media.mimetype || "application/octet-stream";
        const buffer = Buffer.from(files[media.file]);
        try {
          const storagePath = buildMediaStoragePath({
            restaurantId,
            conversationId: conv.id,
            contentType,
          });
          const { error } = await adminSupabaseClient.storage
            .from(WHATSAPP_MEDIA_BUCKET)
            .upload(storagePath, buffer, {
              contentType,
              upsert: false,
              cacheControl: "3600",
            });
          if (error) throw error;
          messageType = messageTypeFromContentType(contentType);
          content = m.body && m.body.trim() ? m.body : placeholderCaptionFor(messageType);
          metadata.media = [
            {
              storage_path: storagePath,
              content_type: contentType,
              size_bytes: media.bytes ?? buffer.length,
              original_filename: media.filename ?? null,
              delivery_status: "stored",
            },
          ];
          result.mediaUploaded += 1;
        } catch {
          messageType = messageTypeFromContentType(contentType);
          content = m.body && m.body.trim() ? m.body : placeholderCaptionFor(messageType);
          result.mediaSkipped += 1;
        }
      } else if (m.hasMedia) {
        // Media existed but was not packaged (too large / download failed).
        messageType =
          m.type === "ptt"
            ? "voice"
            : ["image", "video", "document", "audio"].includes(m.type)
            ? m.type
            : "file";
        content = m.body && m.body.trim() ? m.body : placeholderCaptionFor(messageType);
        metadata.media = [
          {
            storage_path: null,
            content_type: media?.mimetype ?? null,
            size_bytes: media?.bytes ?? null,
            original_filename: media?.filename ?? null,
            delivery_status: "too_large",
          },
        ];
        result.mediaSkipped += 1;
      }

      rows.push({
        conversation_id: conv.id,
        role: m.fromMe ? "agent" : "customer",
        content,
        message_type: messageType,
        metadata,
        external_message_sid: m.id || null,
        delivery_status: m.fromMe ? "delivered" : "received",
        channel: "whatsapp",
        created_at: ts ? iso(ts) : new Date().toISOString(),
      });
      if (m.id) seen.add(m.id);
    }

    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await adminSupabaseClient.from("messages").insert(chunk);
      if (error) throw new Error(`message insert failed: ${error.message}`);
      result.messagesInserted += chunk.length;
    }

    if (rows.length > 0 && maxTs > 0) {
      const update: Record<string, unknown> = { last_message_at: iso(maxTs) };
      if (maxInboundTs > 0) update.last_inbound_at = iso(maxInboundTs);
      if (conv.is_new && minTs !== Number.MAX_SAFE_INTEGER) {
        update.started_at = iso(minTs);
      }
      await adminSupabaseClient.from("conversations").update(update).eq("id", conv.id);
    }

    result.chatsImported += 1;
  }

  return result;
}
