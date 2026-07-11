'use strict';

const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const { config } = require('./config');
const { WaExport, Status } = require('./exporter');

if (!config.token) {
  console.error('[wa-export] FATAL: EXPORT_TOKEN is not set. Refusing to start.');
  process.exit(1);
}

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.sessionsDir, { recursive: true });

/** @type {Map<string, WaExport>} */
const exports_ = new Map();

const app = express();
app.use(express.json({ limit: '256kb' }));

// --- auth: constant-time bearer check -------------------------------------
function timingSafeEqual(a, b) {
  const ba = Buffer.from(a || '', 'utf8');
  const bb = Buffer.from(b || '', 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const h = req.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!timingSafeEqual(token, config.token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

function activeCount() {
  let n = 0;
  for (const e of exports_.values()) {
    if ([Status.PENDING_QR, Status.SCANNING, Status.CONNECTED, Status.SYNCING].includes(e.status)) n += 1;
  }
  return n;
}

// --- routes ---------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ status: 'ok', active: activeCount(), total: exports_.size }));

// Start a new export: boot a WhatsApp client and begin the QR handshake.
app.post('/exports', async (req, res) => {
  if (activeCount() >= config.maxConcurrent) {
    return res.status(429).json({ error: 'busy', message: `max ${config.maxConcurrent} concurrent export(s)` });
  }
  const id = crypto.randomUUID();
  const exp = new WaExport(id, {
    clientName: req.body && req.body.clientName,
    clientPhone: req.body && req.body.clientPhone,
  });
  exports_.set(id, exp);
  try {
    await exp.start();
  } catch (e) {
    exp._fail(`start failed: ${e && e.message ? e.message : e}`);
  }
  res.status(201).json(exp.summary());
});

function getExp(req, res) {
  const exp = exports_.get(req.params.id);
  if (!exp) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  return exp;
}

// Poll QR + status while the client scans.
app.get('/exports/:id/qr', (req, res) => {
  const exp = getExp(req, res);
  if (!exp) return;
  res.json({ status: exp.status, qr: exp.qr, qrDataUrl: exp.qrDataUrl });
});

// Full status + live pull progress.
app.get('/exports/:id', (req, res) => {
  const exp = getExp(req, res);
  if (!exp) return;
  res.json(exp.summary());
});

// Stream the built archive (call once status === 'ready').
app.get('/exports/:id/download', (req, res) => {
  const exp = getExp(req, res);
  if (!exp) return;
  if (exp.status !== Status.READY || !fs.existsSync(exp.zipPath)) {
    return res.status(409).json({ error: 'not_ready', status: exp.status });
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="export-${exp.id}.zip"`);
  fs.createReadStream(exp.zipPath).pipe(res);
});

// Unlink WhatsApp + purge all local data for this export.
app.post('/exports/:id/disconnect', async (req, res) => {
  const exp = getExp(req, res);
  if (!exp) return;
  await exp.disconnect();
  exp.purgeFiles();
  exports_.delete(exp.id);
  res.json({ status: 'disconnected', id: exp.id });
});

// --- TTL sweep: purge abandoned exports -----------------------------------
setInterval(() => {
  const now = Date.now();
  for (const [id, exp] of exports_) {
    const age = now - exp.createdAt;
    const terminal = [Status.READY, Status.ERROR, Status.DISCONNECTED].includes(exp.status);
    if (age > config.exportTtlMs && (terminal || exp.status !== Status.SYNCING)) {
      exp.disconnect().catch(() => {});
      exp.purgeFiles();
      exports_.delete(id);
      console.log(`[wa-export] TTL-purged export ${id} (age ${Math.round(age / 60000)}m, status ${exp.status})`);
    }
  }
}, 5 * 60 * 1000).unref();

app.listen(config.port, config.host, () => {
  console.log(`[wa-export] listening on ${config.host}:${config.port} (maxConcurrent=${config.maxConcurrent})`);
});
