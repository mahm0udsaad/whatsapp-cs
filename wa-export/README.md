# wa-export

Isolated WhatsApp chat-history export service for **Nehgz** client onboarding.

A new client scans a QR with their WhatsApp → this service links as a device, pulls
their chat history + contacts + media/voice notes, packages a ZIP, and (after the
client approves in the dashboard) unlinks and purges everything.

## Isolation guarantee

This runs **completely separately** from the shared `openwa-api` Docker container that
holds the 5 production sessions (Skylight + another project). Separate process, separate
port (`2786`), separate session dir, separate Chromium. It never reads, writes, starts,
stops, or restarts anything in `openwa-api`.

## API (all routes require `Authorization: Bearer $EXPORT_TOKEN`, except `/health`)

| Method | Path | Purpose |
|---|---|---|
| GET  | `/health` | liveness + active/total counts (no auth) |
| POST | `/exports` | `{clientName, clientPhone?}` → boots a client, starts QR handshake |
| GET  | `/exports/:id/qr` | `{status, qr, qrDataUrl}` — poll while scanning |
| GET  | `/exports/:id` | status + live pull progress + summary |
| GET  | `/exports/:id/download` | stream the ZIP (once `status === "ready"`) |
| POST | `/exports/:id/disconnect` | unlink WhatsApp + purge all local data |

Status flow: `pending_qr → scanning → connected → syncing → ready` (or `error` / `disconnected`).

### ZIP contents
```
client.json          # client name, connected number, counts, exportedAt
contacts.json        # [{id, number, name, pushname, isMyContact, ...}]
chats/<chatId>.json  # {chatId, name, isGroup, messages:[{id, ts, fromMe, type, body, media}]}
media/<chatId>/<msgId>.<ext>   # images, videos, docs, voice notes (ptt → .ogg)
```

## Deploy (VPS)

```bash
# one-time Chromium runtime libs for puppeteer's bundled build
apt-get update && apt-get install -y \
  ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
  libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libx11-6 \
  libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1

# app
mkdir -p /var/www/wa-export && cd /var/www/wa-export
# copy this folder's contents here, then:
cp .env.example .env      # set EXPORT_TOKEN (openssl rand -hex 32)
npm install --omit=dev
pm2 start ecosystem.config.js && pm2 save
```

Then expose to the Vercel Next app via nginx (guarded by the same token) at e.g.
`https://<domain>/wa-export/` → `proxy_pass http://127.0.0.1:2786/`.

## Local dev

```bash
npm install
cp .env.example .env   # set EXPORT_TOKEN
npm run dev
```
