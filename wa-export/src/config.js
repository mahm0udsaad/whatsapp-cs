'use strict';

const path = require('path');
require('dotenv').config();

function int(name, def) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) ? v : def;
}
function bool(name, def) {
  const v = process.env[name];
  if (v == null) return def;
  return /^(1|true|yes|on)$/i.test(v);
}

const ROOT = path.resolve(__dirname, '..');

const config = {
  host: process.env.HOST || '127.0.0.1',
  port: int('PORT', 2786),
  // Shared secret the Nehgz backend must send as `Authorization: Bearer <token>`.
  token: process.env.EXPORT_TOKEN || '',
  // Where raw pulled files + built zips live (working area, purged on disconnect/TTL).
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  // whatsapp-web.js LocalAuth session storage (kept isolated from openwa-api).
  sessionsDir: process.env.SESSIONS_DIR || path.join(ROOT, '.sessions'),
  // Optional explicit Chromium path; otherwise puppeteer's bundled build is used.
  chromiumPath: process.env.CHROMIUM_PATH || undefined,
  // Bound concurrent live WhatsApp links to keep RAM in check.
  maxConcurrent: int('MAX_CONCURRENT', 1),
  // History depth knobs.
  fetchLimitPerChat: int('FETCH_LIMIT_PER_CHAT', 1000),
  maxChats: int('MAX_CHATS', 0), // 0 = all
  // After `ready`, WhatsApp streams the linked-device history backfill to the
  // freshly linked device over the following seconds/minutes. Reading before it
  // lands yields only the last (preview) message per chat, so wait for it to
  // settle first. syncSettleMs = initial grace before the first read;
  // syncSettleMaxMs = hard ceiling on total wait; syncPollMs = re-check cadence
  // (proceed early once the loaded-message count stops growing).
  syncSettleMs: int('SYNC_SETTLE_MS', 60000),
  syncSettleMaxMs: int('SYNC_SETTLE_MAX_MS', 300000),
  syncPollMs: int('SYNC_POLL_MS', 20000),
  downloadMedia: bool('MEDIA', true),
  // Skip a media file larger than this (bytes) to avoid runaway pulls. 0 = no cap.
  maxMediaBytes: int('MAX_MEDIA_BYTES', 0),
  // Abandoned exports are purged after this many ms.
  exportTtlMs: int('EXPORT_TTL_MS', 6 * 60 * 60 * 1000),
};

module.exports = { config };
