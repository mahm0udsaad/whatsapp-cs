# Architecture Overview

## System Architecture

```
Customer (WhatsApp)
    |
    v
Twilio WhatsApp API
    |
    v
POST /api/webhooks/twilio  (Next.js API Route)
    |
    |-- Validate Twilio signature
    |-- Rate limit by phone number
    |-- Check opt-out status
    |-- Handle STOP/START keywords
    |-- Resolve restaurant by incoming phone number
    |-- Find or create conversation (track last_inbound_at)
    |-- Save inbound message
    |-- Queue AI reply job -> ai_reply_jobs table
    |-- Log webhook event
    |-- Return empty TwiML
    |
    v
pg_cron (every minute)
    |
    v
Supabase Edge Function: process-ai-replies
    |
    v
POST /api/internal/process-ai-replies  (Bearer token auth)
    |
    |-- Fetch pending/retryable jobs (limit 10)
    |-- For each job:
    |   |-- Lock job (status: processing)
    |   |-- Check 24-hour session window
    |   |-- Check opt-out status
    |   |-- Load conversation history (12 messages)
    |   |-- Query knowledge base (keyword match)
    |   |-- Fetch available menu items (limit 30)
    |   |-- Generate AI response via Gemini
    |   |-- Send WhatsApp reply via Twilio
    |   |-- Save agent message
    |   |-- Mark job completed
    |   |-- On failure: retry up to 5 times
    |
    v
Twilio -> Customer (WhatsApp reply)
    |
    v
POST /api/webhooks/twilio/status  (Status callback)
    |-- Update message delivery_status
    |-- Update campaign_recipients (if marketing)
```

---

## Database Schema (Key Tables)

### Core Business
| Table | Purpose |
|-------|---------|
| `profiles` | User accounts (linked to Supabase Auth) |
| `restaurants` | Restaurant configuration, Twilio phone, provisioning status |
| `ai_agents` | AI personality, system instructions, language, temperature |
| `conversations` | Customer threads with status and last_inbound_at tracking |
| `messages` | All messages (customer/agent/system) with delivery tracking |
| `knowledge_base` | RAG context entries with optional vector embeddings |
| `menu_items` | Restaurant menu with pricing, categories, availability |

### Infrastructure
| Table | Purpose |
|-------|---------|
| `ai_reply_jobs` | Durable async queue for AI reply processing |
| `whatsapp_numbers` | Phone number inventory with assignment/onboarding state |
| `provisioning_runs` | Audit trail for tenant provisioning steps |
| `webhook_events` | Observability log for all webhook traffic |
| `opt_outs` | WhatsApp opt-out compliance tracking |

### Marketing
| Table | Purpose |
|-------|---------|
| `marketing_templates` | WhatsApp message templates (Meta-approved) |
| `marketing_campaigns` | Campaign metadata and aggregate stats |
| `campaign_recipients` | Individual recipient delivery tracking |

---

## Key Design Decisions

### Why async AI replies?
The Twilio webhook has a 15-second timeout. Gemini can take 3-10 seconds. To avoid webhook timeouts:
1. Webhook saves the message and queues a job (fast, <500ms)
2. Returns empty TwiML immediately
3. Worker picks up the job separately and sends the reply via Twilio API

### Why pg_cron + Edge Function instead of Vercel Cron?
- pg_cron runs at Supabase level, independent of Next.js deployment
- Edge Function is lightweight — just forwards the request to the Next.js API
- No Vercel Pro plan required for cron

### Why in-memory rate limiting?
- Simple, zero-dependency solution for single-instance deployment
- Sufficient for a single restaurant with moderate traffic
- Should be replaced with Redis if scaling to multiple serverless instances

### Why keyword-based knowledge base search instead of vector similarity?
- Vector embeddings require an embedding model (OpenAI/Gemini) per query
- Adds latency and cost per message
- Keyword matching is sufficient for small knowledge bases (<100 entries)
- The `match_knowledge_base` vector function exists and can be enabled later

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Admin key (server-side only) |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Yes | WhatsApp sender phone number |
| `GOOGLE_GEMINI_API_KEY` | Yes | Google Gemini API key |
| `NEXT_PUBLIC_APP_URL` | Yes | App URL for webhooks/callbacks |
| `AI_REPLY_WORKER_SECRET` | Recommended | Bearer token for worker endpoint |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL 17) |
| Auth | Supabase Auth |
| Real-time | Supabase Realtime (postgres_changes) |
| WhatsApp | Twilio WhatsApp Business API |
| AI | Google Gemini 3.1 Flash Lite |
| Styling | Tailwind CSS + Radix UI |
| Language | TypeScript |
| Cron | pg_cron + Supabase Edge Functions |
