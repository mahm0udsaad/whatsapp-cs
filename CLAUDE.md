# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read [AGENT.md](AGENT.md) before making product or architecture decisions** — it is the detailed working guide (domain invariants, routing model, Twilio rules, priority order). This file covers commands and the big picture; AGENT.md covers the rules. Treat `AGENT_CONTEXT.md` and most other root-level `*.md` files as historical context, not current truth.

## What this is

Multi-tenant restaurant WhatsApp SaaS ("نِحجز" / Nehgz): tenant provisioning, WhatsApp message routing (Twilio), an AI restaurant assistant (Gemini via Vercel AI SDK), and a restaurant control dashboard. Next.js 16 App Router web app + Expo mobile app + an isolated VPS chat-export service.

## Commands

Web app (repo root — deps installed with `bun install`, both bun.lock and package-lock.json exist):

```bash
npm run dev            # Next.js dev server
npm run build          # production build
npm run lint           # eslint
npm test               # vitest run (all tests)
npx vitest run src/lib/__tests__/conversations.test.ts   # single test file
npx tsc --noEmit       # typecheck — expected validation after meaningful changes
```

Mobile app (`mobile/`, Expo SDK 54, uses bun):

```bash
npm run mobile:start / mobile:ios / mobile:android   # from repo root
cd mobile && bun run test                            # jest tests
```

Seeding / ingestion scripts (need `.env.local`): `npm run ingest`, `seed:tenant-knowledge`, `seed:kiara`, `seed:kiara-menu`.

## Architecture

Three deployables:

1. **`src/` — Next.js web app** (Vercel). Route groups: `(auth)`, `(dashboard)`, `(onboarding)`, `(public)`. API surface under `src/app/api/`: `dashboard/*` (owner CRUD), `mobile/*` (Expo app's backend), `webhooks/twilio` + `webhooks/nehgz` (inbound messages), `internal/*` (cron/worker endpoints), plus `onboarding`, `orders`, `menu`, `leads`, `marketing`.
2. **`mobile/` — Expo Router app** for restaurant owners/staff, talks to `src/app/api/mobile/*`. Has its own lockfile, tests (jest), and EAS build config.
3. **`wa-export/` — isolated WhatsApp chat-history export service** (Node + puppeteer, PM2 on the VPS, port 2786). Client scans a QR, service pulls chat history into a ZIP, dashboard ingests it via `src/lib/export-ingest.ts` / `src/lib/wa-export.ts`. It is deliberately separate from the shared production `openwa-api` container on the same VPS — never couple them.

**Data**: Supabase (Postgres + auth + storage). Migrations in `supabase/migrations/`. Types in `src/lib/types.ts` must stay aligned with SQL. Code can be ahead of the deployed DB — never assume a local migration is applied remotely.

**Message flow** (the critical path — see AGENT.md invariants):

```
inbound WhatsApp → webhook (validate, dedupe by Twilio SID, resolve tenant by number,
persist message) → enqueue ai_reply_job → worker (api/internal/process-ai-replies)
→ Gemini generates reply → send via Twilio → status callback updates delivery state
```

AI/LLM work never runs inline in the webhook. Routing key: WhatsApp number → sender record → restaurant → active AI agent. Tenant isolation is the top invariant — every query path must be scoped to the resolved tenant.

**Domain logic lives in `src/lib/`** (flat, one module per concern): `tenant.ts` (tenant resolution), `ai-reply-jobs.ts` (queue), `twilio.ts` / `twilio-provisioning.ts`, `conversations.ts`, `rag.ts` + knowledge-base modules, `order-manager.ts`, `ai-schedule.ts`, escalation/classification modules. Tests are colocated in `src/lib/__tests__/`.

## Working rules (condensed from AGENT.md)

- Source-of-truth order on conflict: migrations/SQL → `src/lib` + `src/app/api` runtime code → dashboard pages → older markdown docs.
- Webhook handling must stay idempotent (Twilio SID dedupe); persist inbound messages before any AI work.
- Prefer additive migrations; add indexes for routing/status/tenant lookups; keep `types.ts` in sync.
- Don't add mock data to pages that already have real tenant data paths; don't hardcode restaurant identity.
- After material architecture/product-state changes, update `SAAS_STATE_AND_VISION.md`.
- Reliability beats polish: schema/type correctness → onboarding/provisioning → webhook + async reply reliability → tenant-safe CRUD → observability → marketing features → cosmetics.
