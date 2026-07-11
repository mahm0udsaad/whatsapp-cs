'use strict';

// Map common WhatsApp media mimetypes to a file extension.
const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg', // voice notes (ptt) are usually audio/ogg; codecs=opus
  'audio/ogg; codecs=opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'xls',
  'application/msword': 'doc',
  'application/zip': 'zip',
  'text/plain': 'txt',
};

function extFromMime(mime) {
  if (!mime) return 'bin';
  const key = mime.toLowerCase();
  if (MIME_EXT[key]) return MIME_EXT[key];
  const base = key.split(';')[0].trim();
  if (MIME_EXT[base]) return MIME_EXT[base];
  const slash = base.split('/')[1];
  return (slash || 'bin').replace(/[^a-z0-9]/g, '') || 'bin';
}

// Filesystem-safe token from a WhatsApp id like "9665...@c.us" or "...@g.us".
function safeId(id) {
  return String(id || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

module.exports = { extFromMime, safeId };
