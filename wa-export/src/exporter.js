'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { config } = require('./config');
const { extFromMime, safeId } = require('./util');

/**
 * Lifecycle status of one export:
 *   pending_qr -> scanning -> connected -> syncing -> ready
 *   (any) -> error / disconnected
 */
const Status = {
  PENDING_QR: 'pending_qr',
  SCANNING: 'scanning',
  CONNECTED: 'connected',
  SYNCING: 'syncing',
  READY: 'ready',
  ERROR: 'error',
  DISCONNECTED: 'disconnected',
};

class WaExport {
  constructor(id, { clientName, clientPhone }) {
    this.id = id;
    this.clientName = clientName || null;
    this.clientPhone = clientPhone || null;
    this.status = Status.PENDING_QR;
    this.error = null;
    this.qr = null; // last raw QR string
    this.qrDataUrl = null; // rendered data URL for <img>
    this.number = null; // connected WhatsApp number (wid)
    this.pushname = null;
    this.createdAt = Date.now();
    this.connectedAt = null;
    this.readyAt = null;
    this.progress = { totalChats: 0, chats: 0, messages: 0, mediaFiles: 0, bytes: 0 };
    this.workDir = path.join(config.dataDir, id);
    this.zipPath = path.join(config.dataDir, `${id}.zip`);
    this.client = null;
    this._pulling = false;
  }

  summary() {
    return {
      id: this.id,
      status: this.status,
      error: this.error,
      clientName: this.clientName,
      clientPhone: this.clientPhone,
      number: this.number,
      pushname: this.pushname,
      progress: this.progress,
      createdAt: this.createdAt,
      connectedAt: this.connectedAt,
      readyAt: this.readyAt,
      hasArchive: this.status === Status.READY && fs.existsSync(this.zipPath),
    };
  }

  async start() {
    fs.mkdirSync(this.workDir, { recursive: true });
    fs.mkdirSync(config.sessionsDir, { recursive: true });

    const puppeteer = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    };
    if (config.chromiumPath) puppeteer.executablePath = config.chromiumPath;

    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: this.id, dataPath: config.sessionsDir }),
      puppeteer,
    });

    this.client.on('qr', async (qr) => {
      this.qr = qr;
      this.status = Status.PENDING_QR;
      try {
        this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      } catch {
        this.qrDataUrl = null;
      }
    });
    this.client.on('authenticated', () => {
      this.status = Status.SCANNING;
      this.qr = null;
      this.qrDataUrl = null;
    });
    this.client.on('auth_failure', (m) => this._fail(`auth_failure: ${m}`));
    this.client.on('disconnected', (r) => {
      if (this.status !== Status.READY) this._fail(`disconnected: ${r}`);
    });
    this.client.on('ready', () => {
      this.status = Status.CONNECTED;
      this.connectedAt = Date.now();
      const info = this.client.info || {};
      this.number = info.wid && info.wid.user ? info.wid.user : (info.wid && info.wid._serialized) || null;
      this.pushname = info.pushname || null;
      // Auto-begin the pull as soon as the phone is linked.
      this.pull().catch((e) => this._fail(`pull failed: ${e && e.message ? e.message : e}`));
    });

    await this.client.initialize();
  }

  _fail(msg) {
    this.error = msg;
    this.status = Status.ERROR;
  }

  async pull() {
    if (this._pulling) return;
    this._pulling = true;
    this.status = Status.SYNCING;

    const chatsDir = path.join(this.workDir, 'chats');
    const mediaDir = path.join(this.workDir, 'media');
    fs.mkdirSync(chatsDir, { recursive: true });
    fs.mkdirSync(mediaDir, { recursive: true });

    const chats = await this.client.getChats();
    this.progress.totalChats = chats.length;

    let processed = 0;
    for (const chat of chats) {
      if (config.maxChats > 0 && processed >= config.maxChats) break;
      const chatId = chat.id && chat.id._serialized ? chat.id._serialized : String(chat.id);
      const chatKey = safeId(chatId);

      let msgs = [];
      try {
        msgs = await chat.fetchMessages({ limit: config.fetchLimitPerChat });
      } catch (e) {
        msgs = [];
      }

      const records = [];
      for (const m of msgs) {
        const rec = {
          id: m.id && m.id._serialized ? m.id._serialized : String(m.id),
          timestamp: m.timestamp || null,
          fromMe: Boolean(m.fromMe),
          from: m.from || null,
          to: m.to || null,
          author: m.author || null, // sender in group chats
          type: String(m.type || 'unknown'),
          body: m.body || '',
          hasMedia: Boolean(m.hasMedia),
        };
        if (m.location) rec.location = { lat: m.location.latitude, lng: m.location.longitude, desc: m.location.description || null };
        if (m.vCards && m.vCards.length) rec.vcards = m.vCards;

        if (config.downloadMedia && m.hasMedia) {
          try {
            const media = await m.downloadMedia();
            if (media && media.data) {
              const buf = Buffer.from(media.data, 'base64');
              if (config.maxMediaBytes > 0 && buf.length > config.maxMediaBytes) {
                rec.media = { skipped: 'too_large', mimetype: media.mimetype, bytes: buf.length };
              } else {
                const ext = extFromMime(media.mimetype);
                const fname = `${safeId(rec.id)}.${ext}`;
                const chatMediaDir = path.join(mediaDir, chatKey);
                fs.mkdirSync(chatMediaDir, { recursive: true });
                fs.writeFileSync(path.join(chatMediaDir, fname), buf);
                rec.media = {
                  file: `media/${chatKey}/${fname}`,
                  mimetype: media.mimetype || null,
                  filename: media.filename || null,
                  bytes: buf.length,
                  isVoice: rec.type === 'ptt',
                };
                this.progress.mediaFiles += 1;
                this.progress.bytes += buf.length;
              }
            }
          } catch (e) {
            rec.mediaError = String(e && e.message ? e.message : e);
          }
        }
        records.push(rec);
        this.progress.messages += 1;
      }

      const contact = await chat.getContact().catch(() => null);
      const chatDoc = {
        chatId,
        name: chat.name || (contact && (contact.name || contact.pushname)) || null,
        isGroup: Boolean(chat.isGroup),
        number: contact && contact.number ? contact.number : null,
        messageCount: records.length,
        messages: records,
      };
      fs.writeFileSync(path.join(chatsDir, `${chatKey}.json`), JSON.stringify(chatDoc, null, 2));
      this.progress.chats += 1;
      processed += 1;
    }

    // Contacts
    let contacts = [];
    try {
      const all = await this.client.getContacts();
      contacts = all
        .filter((c) => c.id && c.id.user && !c.isMe)
        .map((c) => ({
          id: c.id._serialized,
          number: c.number || (c.id && c.id.user) || null,
          name: c.name || null,
          pushname: c.pushname || null,
          shortName: c.shortName || null,
          isMyContact: Boolean(c.isMyContact),
          isBusiness: Boolean(c.isBusiness),
          isGroup: Boolean(c.isGroup),
        }));
    } catch (e) {
      contacts = [];
    }
    fs.writeFileSync(path.join(this.workDir, 'contacts.json'), JSON.stringify(contacts, null, 2));

    // Client manifest
    const manifest = {
      exportId: this.id,
      clientName: this.clientName,
      clientPhoneProvided: this.clientPhone,
      connectedNumber: this.number,
      pushname: this.pushname,
      connectedAt: this.connectedAt ? new Date(this.connectedAt).toISOString() : null,
      exportedAt: new Date().toISOString(),
      counts: {
        chats: this.progress.chats,
        messages: this.progress.messages,
        mediaFiles: this.progress.mediaFiles,
        contacts: contacts.length,
        bytes: this.progress.bytes,
      },
      note: 'History reflects WhatsApp linked-device sync (recent messages, pageable) — not necessarily a full lifetime archive.',
    };
    fs.writeFileSync(path.join(this.workDir, 'client.json'), JSON.stringify(manifest, null, 2));

    await this._buildZip();
    this.readyAt = Date.now();
    this.status = Status.READY;
    this._pulling = false;
  }

  _buildZip() {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(this.zipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(this.workDir, false);
      archive.finalize();
    });
  }

  // Unlink the WhatsApp session and purge all local data for this export.
  async disconnect() {
    try {
      if (this.client) {
        await this.client.logout().catch(() => {});
        await this.client.destroy().catch(() => {});
      }
    } finally {
      this.client = null;
      this.status = Status.DISCONNECTED;
    }
  }

  purgeFiles() {
    for (const p of [this.workDir, this.zipPath, path.join(config.sessionsDir, `session-${this.id}`)]) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

module.exports = { WaExport, Status };
