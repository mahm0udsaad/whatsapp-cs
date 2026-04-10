# Production Hardening Changelog

**Date:** April 8, 2026
**Commit:** `087976c`
**Branch:** `main`

---

## Overview

Comprehensive production hardening of the WhatsApp AI Customer Service SaaS. All changes focus on security, compliance, reliability, and observability for a single-restaurant deployment.

---

## 1. Database Migrations Applied (Remote Supabase)

### Migration: `ai_reply_jobs` (20260407133000)
- Created `ai_reply_jobs` table — durable async queue for AI reply processing
- Fields: `restaurant_id`, `conversation_id`, `inbound_message_id`, `status`, `attempt_count`, `max_attempts` (default 5), `locked_at`, `processed_at`, `last_error`, `payload`
- Unique index on `inbound_message_id` (idempotency)
- Status + created_at index for worker polling
- RLS enabled, trigger for `updated_at`

### Migration: `saas_foundation` (20260407193000)
- Created `whatsapp_numbers` table — phone number inventory with assignment/onboarding state tracking
- Created `provisioning_runs` table — audit trail for tenant provisioning steps
- Extended `restaurants` table: `primary_whatsapp_number_id`, `provisioning_status`, `onboarding_completed_at`, `activation_started_at`, `activated_at`, `metadata`
- Extended `ai_agents` table: `max_context_messages` (default 10), `temperature` (default 0.40)
- Extended `messages` table: `twilio_message_sid`, `twilio_status`, `external_error_code`, `channel`
- Seeded `whatsapp_numbers` from existing restaurants
- Backfilled `primary_whatsapp_number_id` on restaurants
- Seeded `provisioning_runs` from existing restaurants
- RLS enabled on all new tables with owner-scoped policies
- Indexes on all foreign keys and status columns

### Migration: `fix_function_search_paths_and_rls`
- Fixed `update_updated_at()` function — added `SET search_path = ''`
- Fixed `set_updated_at()` function — added `SET search_path = ''`
- Fixed `set_updated_at_timestamp()` function — added `SET search_path = ''`
- Fixed `match_knowledge_base()` (both overloads) — added `SET search_path = ''`
- Created `opt_outs` table — WhatsApp opt-out compliance tracking (restaurant_id + phone_number unique)
- Added `last_inbound_at` column to `conversations` — for 24-hour session window tracking
- Created `webhook_events` table — observability/audit log for webhook traffic
- RLS + owner-scoped policies on `opt_outs` and `webhook_events`

### Migration: `add_conversation_auto_resolve`
- Created `auto_resolve_stale_conversations()` function — marks conversations inactive >48h as `resolved`
- Scheduled via `pg_cron` to run every hour

### Migration: `fix_remaining_search_paths_and_rls_v2`
- Dropped and recreated second overload of `match_knowledge_base()` with fixed search_path
- Added RLS policies: `owners_can_view_opt_outs`, `owners_can_view_webhook_events`

---

## 2. Security Fixes

### Webhook Signature Validation
- Twilio webhook signature validation remains using parent auth token (single-restaurant setup)
- Signature check is enforced when `x-twilio-signature` header is present

### Menu Crawl Route Secured
- **Removed `/api/menu/` from public middleware prefixes** — now requires authentication
- Added **SSRF protection**: blocks `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, `169.254.169.254`, private IP ranges (`10.x`, `172.16-31.x`, `192.168.x`)
- Only allows `http:` and `https:` protocols
- Added user authentication check via `createServerSupabaseClient()`
- Added rate limiting (5 requests/minute per user)

### Function Search Path Security
- All 5 database functions (`update_updated_at`, `set_updated_at`, `set_updated_at_timestamp`, `match_knowledge_base` x2) now have `SET search_path = ''` — eliminates SQL injection risk via mutable search path

### Supabase Security Advisor Results (Post-Fix)
- `function_search_path_mutable` warnings: **RESOLVED** (all cleared)
- `rls_enabled_no_policy` on `ai_reply_jobs`: **Intentional** — only accessed by service role
- `auth_leaked_password_protection`: **Manual action required** — enable in Supabase Dashboard

---

## 3. WhatsApp Compliance

### Opt-Out / Opt-In Handling (New)
**File:** `src/app/api/webhooks/twilio/route.ts`

- Recognizes opt-out keywords (case-insensitive): `stop`, `unsubscribe`, `cancel`, `إلغاء`, `توقف`, `الغاء`
- Recognizes opt-in keywords: `start`, `subscribe`, `اشتراك`, `ابدأ`
- On opt-out: saves to `opt_outs` table, sends confirmation message in detected language, logs event
- On opt-in: removes from `opt_outs` table, sends welcome-back message, logs event
- Messages from opted-out users are silently ignored (no response sent)
- Opt-out check also enforced in AI reply worker before sending

### 24-Hour Session Window Enforcement (New)
**Files:** `src/lib/session-window.ts`, `src/lib/ai-reply-jobs.ts`

- `isSessionWindowOpen(lastInboundAt)` — checks if customer's last inbound message was within 24 hours
- `getSessionWindowRemaining(lastInboundAt)` — returns remaining ms in the window
- Webhook now tracks `last_inbound_at` on every inbound message (stored on `conversations` table)
- AI reply worker checks session window before sending — if expired, job is marked `failed` with descriptive error instead of sending (which would cause Twilio error 63016)

---

## 4. Rate Limiting (New)

**File:** `src/lib/rate-limit.ts`

In-memory rate limiter with configurable window and limit per key.

| Route | Limit | Window | Key |
|-------|-------|--------|-----|
| Twilio webhook | 60 req | 1 min | `webhook:{phone}` |
| Dashboard API | 30 req | 1 min | `dashboard:{userId}` |
| Menu crawl | 5 req | 1 min | `crawl:{userId}` |
| AI worker | 10 req | 1 min | static |

- Auto-cleanup of stale entries every 5 minutes
- Note: In-memory only — does not persist across serverless invocations. Replace with Redis for multi-instance deployments.

---

## 5. Observability (New)

### Webhook Event Logging
**Table:** `webhook_events`

Every webhook invocation logs:
- `event_type`: `processed`, `signature_invalid`, `rate_limited`, `no_restaurant`, `no_ai_agent`, `opt_out`, `opt_in`, `ignored_opted_out`, `error`
- `message_sid`, `restaurant_id`
- `payload` (JSON metadata)
- `processing_time_ms`
- `error` text (if any)

### Conversation Auto-Resolve
- `pg_cron` job runs hourly
- Marks conversations with no activity for 48+ hours as `resolved`
- Prevents dashboard clutter and stale AI context

---

## 6. AI Reply Worker Cron (New)

### Supabase Edge Function: `process-ai-replies`
- Deployed to Supabase Edge Functions
- Calls `POST /api/internal/process-ai-replies` on the Next.js app
- Passes `AI_REPLY_WORKER_SECRET` as Bearer token
- **Scheduled via `pg_cron` every minute** (`* * * * *`)
- Processes up to 10 pending jobs per invocation
- Required env vars on Edge Function: `APP_URL`, `AI_REPLY_WORKER_SECRET`

---

## 7. Dashboard Improvements

### Conversations Inbox
**File:** `src/components/dashboard/conversations-inbox.tsx`

- Added **search bar** — filter conversations by customer name or phone number
- Added **status filter pills** — All / Active / Resolved
- Added **real-time conversation list updates** — new conversations appear without page refresh (Supabase postgres_changes subscription on conversations table)
- Increased conversation limit from 50 to 100

### Middleware Fix
**File:** `src/lib/supabase/middleware.ts`

- Changed public prefixes from `["/api/webhooks/", "/api/menu/"]` to `["/api/webhooks/", "/api/internal/"]`
- `/api/menu/crawl` now requires authentication
- `/api/internal/` remains public (protected by bearer token instead)

---

## 8. New Files Created

| File | Purpose |
|------|---------|
| `src/lib/rate-limit.ts` | In-memory rate limiter with presets |
| `src/lib/session-window.ts` | 24-hour WhatsApp session window utilities |
| `src/lib/ai-reply-jobs.ts` | Async AI reply queue and worker logic |
| `src/lib/tenant.ts` | Tenant context resolution (user -> restaurant -> agent) |
| `src/lib/onboarding.ts` | Restaurant provisioning and onboarding logic |
| `src/lib/twilio-provisioning.ts` | Twilio subaccount and number provisioning |
| `src/app/api/dashboard/ai-agent/route.ts` | AI agent settings API |
| `src/app/api/dashboard/restaurant/route.ts` | Restaurant settings API |
| `src/app/api/dashboard/provisioning/route.ts` | Provisioning retry API |
| `src/app/api/dashboard/knowledge-base/route.ts` | Knowledge base CRUD API |
| `src/app/api/dashboard/knowledge-base/[id]/route.ts` | Knowledge base item API |
| `src/app/api/dashboard/menu/route.ts` | Menu items CRUD API |
| `src/app/api/dashboard/menu/[id]/route.ts` | Menu item API |
| `src/app/api/internal/process-ai-replies/route.ts` | AI worker endpoint |
| `src/app/api/onboarding/route.ts` | Onboarding API |
| `src/components/dashboard/dashboard-shell.tsx` | Dashboard layout shell |
| `src/components/dashboard/ai-agent-settings-form.tsx` | AI agent config form |
| `src/components/dashboard/conversations-inbox.tsx` | Conversations + messages UI |
| `src/components/dashboard/knowledge-base-manager.tsx` | KB CRUD interface |
| `src/components/dashboard/menu-manager.tsx` | Menu management + crawl UI |
| `src/components/dashboard/restaurant-settings-form.tsx` | Restaurant settings form |
| `supabase/migrations/20260407133000_ai_reply_jobs.sql` | AI reply jobs migration |
| `supabase/migrations/20260407193000_saas_foundation.sql` | SaaS foundation migration |
| `.claude/launch.json` | Dev server config for Claude preview |

---

## 9. pg_cron Jobs Active

| Job | Schedule | Description |
|-----|----------|-------------|
| `auto-resolve-stale-conversations` | `0 * * * *` (hourly) | Resolves conversations inactive >48h |
| `process-ai-replies-worker` | `* * * * *` (every minute) | Triggers Edge Function to process AI reply queue |

---

## 10. Remaining Manual Actions

1. **Enable leaked password protection** — Supabase Dashboard > Authentication > Password Security
2. **Set Edge Function env vars** — `APP_URL` and `AI_REPLY_WORKER_SECRET` in Supabase Dashboard > Edge Functions > process-ai-replies
3. **Add error tracking** — Integrate Sentry or similar for production monitoring
4. **Plan BSUID migration** — WhatsApp username migration deadline June 2026
