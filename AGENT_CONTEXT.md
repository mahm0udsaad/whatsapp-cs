# whatsapp-cs — Full Project Context for Next AI Agent

> **Date written:** April 5, 2026
> **Purpose:** Hand-off document so the next AI agent can continue exactly where the previous session left off, with zero re-work.

---

## 1. What This Project Is

**whatsapp-cs** is a multi-tenant WhatsApp AI Customer Service platform for restaurants in **Saudi Arabia and Egypt**.

Three core modules:

| Module | Description |
|--------|-------------|
| **AI Customer Service Agent** | WhatsApp bot powered by Google Gemini 2.0 Flash. Arabic-first. Uses RAG (pgvector) to answer only restaurant-related questions. |
| **Restaurant Dashboard** | Next.js 15 App Router dashboard for restaurant owners to configure their AI agent, manage knowledge base, menu, conversations, and marketing. |
| **WhatsApp Marketing Bot** | Template-based bulk messaging, Excel phone import, campaign management — no AI, uses Twilio template messages. |

---

## 2. Tech Stack

- **Framework:** Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Database:** Supabase (Postgres + Auth + pgvector for RAG + RLS)
- **AI:** Google Gemini API (`gemini-2.0-flash`)
- **Messaging:** Twilio WhatsApp Business API
- **RAG:** pgvector similarity search in Supabase
- **UI Language:** Arabic-first, RTL support (Noto Sans Arabic + Inter fonts)
- **Architecture:** Multi-tenant — each restaurant has its own config, AI agent, knowledge base

---

## 3. Project Location

All files are at: `/sessions/optimistic-funny-franklin/mnt/whatsapp-cs/`

This folder is mounted from the user's computer and persists between sessions.

---

## 4. Current Credentials in `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://nkdkqgrkyqpjdaifazwn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...  ← ✅ FILLED

# Twilio
TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER=+966542228723

# Google Gemini
GOOGLE_GEMINI_API_KEY=YOUR_GEMINI_API_KEY  ← ✅ FILLED

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### How to get the service role key
1. Go to: `https://supabase.com/dashboard/project/nkdkqgrkyqpjdaifazwn/settings/api-keys/legacy`
2. Click **Reveal** on the `service_role` field
3. Copy the value — it starts with `eyJhbGciOiJIUzI1NiIs...` (long JWT)
4. Paste it into `.env.local` on the `SUPABASE_SERVICE_ROLE_KEY=` line

### How to get the Gemini API key
1. Go to: `https://aistudio.google.com/apikey`
2. Create a new key or copy an existing one
3. Paste it into `.env.local` on the `GOOGLE_GEMINI_API_KEY=` line

---

## 5. Database Status

**✅ Already migrated** — all 10 tables exist in the Supabase project with RLS enabled and zero rows.

| Table | RLS | Rows |
|-------|-----|------|
| `profiles` | ✅ | 0 |
| `restaurants` | ✅ | 0 |
| `ai_agents` | ✅ | 0 |
| `knowledge_base` | ✅ | 0 |
| `menu_items` | ✅ | 0 |
| `conversations` | ✅ | 0 |
| `messages` | ✅ | 0 |
| `marketing_templates` | ✅ | 0 |
| `marketing_campaigns` | ✅ | 0 |
| `campaign_recipients` | ✅ | 0 |

The pgvector extension + `match_knowledge_base()` similarity search function should also be present. Verify with:
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

---

## 6. Twilio Setup

- **Account SID:** `YOUR_TWILIO_ACCOUNT_SID` → stored in `.env.local` as `TWILIO_ACCOUNT_SID`
- **Auth Token:** stored in `.env.local` as `TWILIO_AUTH_TOKEN`
- **WhatsApp Sender Number:** `+966542228723` (existing approved sender — "Nehgz hub")
- **Sender SID:** `XE4523bd116a26023294ea7df1396d5315`

### ⚠️ Still needs to be done: Configure Twilio Webhook URL

1. Go to: `https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders/details/XE4523bd116a26023294ea7df1396d5315`
2. In **Messaging Endpoint Configuration**, set the webhook URL to:
   `https://YOUR_DEPLOYED_DOMAIN/api/webhooks/twilio`
3. Save changes.

> The webhook can't be set to `localhost` — the app must be deployed first to get a public URL.

---

## 7. All Source Files Built (41 TypeScript files, zero compile errors)

### API Routes
```
src/app/api/webhooks/twilio/route.ts         ← Main AI webhook (receive → RAG → Gemini → reply)
src/app/api/webhooks/twilio/status/route.ts  ← Delivery status tracking
src/app/api/menu/crawl/route.ts              ← Menu crawler using Cheerio
src/app/auth/callback/route.ts               ← Supabase OAuth callback
```

### Auth Pages
```
src/app/(auth)/layout.tsx
src/app/(auth)/login/page.tsx      ← Email/password + Google OAuth
src/app/(auth)/signup/page.tsx
```

### Onboarding
```
src/app/(onboarding)/onboarding/page.tsx   ← 4-step wizard: restaurant info → AI agent → WhatsApp → menu
```

### Dashboard Pages
```
src/app/(dashboard)/layout.tsx
src/app/(dashboard)/dashboard/page.tsx                           ← Overview: stats, recent conversations, AI status
src/app/(dashboard)/dashboard/restaurant/page.tsx               ← Restaurant settings
src/app/(dashboard)/dashboard/ai-agent/page.tsx                 ← AI agent config (personality cards, prompts)
src/app/(dashboard)/dashboard/knowledge-base/page.tsx           ← Knowledge base manager (add/delete entries)
src/app/(dashboard)/dashboard/menu/page.tsx                     ← Menu items viewer/editor
src/app/(dashboard)/dashboard/conversations/page.tsx            ← Live chat view
src/app/(dashboard)/dashboard/marketing/page.tsx                ← Marketing overview
src/app/(dashboard)/dashboard/marketing/templates/page.tsx      ← WhatsApp template builder
src/app/(dashboard)/dashboard/marketing/campaigns/page.tsx      ← Campaign manager + bulk send
```

### Library / Core
```
src/lib/gemini.ts           ← Google Gemini 2.0 Flash integration + language detection + off-topic guard
src/lib/twilio.ts           ← Twilio WhatsApp client + TwiML + signature validation
src/lib/types.ts            ← All TypeScript interfaces for DB entities
src/lib/utils.ts            ← cn() classname utility
src/lib/supabase/client.ts  ← Browser Supabase client
src/lib/supabase/server.ts  ← Server-side Supabase client
src/lib/supabase/admin.ts   ← Admin client (service role, bypasses RLS — for webhook)
src/lib/supabase/middleware.ts ← Auth middleware (fixed setAll return type)
src/middleware.ts            ← Next.js route protection
```

### UI Components (10 files in `src/components/ui/`)
```
button.tsx, input.tsx, card.tsx, badge.tsx, textarea.tsx,
select.tsx (Radix), tabs.tsx (Radix), avatar.tsx (Radix),
sidebar.tsx, stats-card.tsx
```

---

## 8. How the AI Webhook Works

```
Customer sends WhatsApp message
        ↓
POST /api/webhooks/twilio
        ↓
1. Parse form data (From, To, Body, MessageSid)
2. Lookup restaurant by whatsapp_number = To
3. Find or create conversation for customer phone
4. Save customer message to DB
5. Load AI agent config (system_prompt, personality, language_preference)
6. Get conversation history (last N messages)
7. Query knowledge_base for relevant RAG context (keyword match + pgvector)
8. Get available menu items for context
9. Call Gemini 2.0 Flash with: system prompt + RAG context + chat history + user message
10. Detect if message is restaurant-related (keyword list AR+EN) → return off_topic_response if not
11. Save AI response to DB
12. Send reply via Twilio WhatsApp API
13. Return TwiML response
```

---

## 9. What Is DONE ✅

- [x] Full Next.js 15 project scaffolded with TypeScript + Tailwind
- [x] Supabase project created (`nkdkqgrkyqpjdaifazwn`)
- [x] All 10 database tables created and live with RLS
- [x] All 41 source files written, zero TypeScript errors
- [x] Auth flow (login, signup, Google OAuth, middleware, callback)
- [x] 4-step onboarding wizard
- [x] Full dashboard (8 pages)
- [x] AI webhook with RAG + Gemini integration
- [x] Twilio helper (send, TwiML, signature validation)
- [x] Menu crawler (Cheerio)
- [x] Marketing module UI (templates + campaigns)
- [x] Twilio account SID + auth token saved in `.env.local`
- [x] Twilio WhatsApp sender identified (`+966542228723`)

---

## 10. What Is MISSING / Still TODO ⚠️

These are the **exact remaining tasks** in priority order:

### ✅ Blockers — RESOLVED

1. ~~**Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`**~~ — **DONE**
2. ~~**Add `GOOGLE_GEMINI_API_KEY` to `.env.local`**~~ — **DONE**

All 6 env vars are now set. TypeScript type check passes with zero errors.

### 🟡 Deployment (needed to configure Twilio webhook)

3. **Deploy the app** — Vercel is the recommended target since it's Next.js
   - Run `npm run build` first to confirm zero errors
   - Then deploy to Vercel: `npx vercel --prod`
   - Or connect the GitHub repo to Vercel and auto-deploy
   - Set all env vars in Vercel dashboard (same as `.env.local`)

4. **Configure Twilio webhook URL**
   - Once deployed, go to Twilio Console → WhatsApp Senders → `+966542228723`
   - Set the webhook URL to: `https://YOUR_VERCEL_DOMAIN/api/webhooks/twilio`
   - Also set the Status Callback URL to: `https://YOUR_VERCEL_DOMAIN/api/webhooks/twilio/status`

### 🟢 Integration / Data

5. **Connect dashboard pages to real Supabase data**
   - Currently most dashboard pages render mock/static data
   - Need to wire up Supabase queries in each page (restaurant settings, AI agent config, conversations, etc.)
   - The `src/lib/supabase/server.ts` and `client.ts` clients are ready to use

6. **Test menu crawler with flafeltime.com**
   - `POST /api/menu/crawl` with `{ restaurant_id, url: "https://flafeltime.com" }`
   - Verify it extracts items and saves to `menu_items` + `knowledge_base`

7. **End-to-end test**
   - Send a WhatsApp message to `+966542228723`
   - Verify the full flow: receive → lookup restaurant → RAG → Gemini → reply

8. **Add `match_knowledge_base()` pgvector function** (if not already done)
   - Run this SQL in Supabase SQL Editor if the function doesn't exist:
   ```sql
   CREATE OR REPLACE FUNCTION match_knowledge_base(
     query_embedding vector(768),
     match_restaurant_id uuid,
     match_threshold float DEFAULT 0.7,
     match_count int DEFAULT 5
   )
   RETURNS TABLE (
     id uuid,
     content text,
     source text,
     category text,
     similarity float
   )
   LANGUAGE plpgsql
   AS $$
   BEGIN
     RETURN QUERY
     SELECT
       kb.id,
       kb.content,
       kb.source,
       kb.category,
       1 - (kb.embedding <=> query_embedding) AS similarity
     FROM knowledge_base kb
     WHERE kb.restaurant_id = match_restaurant_id
       AND 1 - (kb.embedding <=> query_embedding) > match_threshold
     ORDER BY kb.embedding <=> query_embedding
     LIMIT match_count;
   END;
   $$;
   ```

### 🔵 Future Enhancements (not needed for MVP)

- Excel/XLSX import for bulk phone numbers in marketing campaigns
- Real-time conversation updates (Supabase Realtime)
- Generative UI (GenUI) in the dashboard for natural language configuration
- Analytics and reporting
- Multi-restaurant support (currently single restaurant per account)

---

## 11. How to Run Locally

```bash
cd /path/to/whatsapp-cs
npm install          # already done, node_modules exist
npm run dev          # starts at http://localhost:3000
```

Before running, make sure `.env.local` has all 4 required values:
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_GEMINI_API_KEY`
- Twilio values are already set

---

## 12. Key Notes for Next Agent

- **The app throws on startup if `GOOGLE_GEMINI_API_KEY` is missing** because `src/lib/gemini.ts` calls `throw new Error(...)` at module level when the key is absent. Same for Twilio keys. Fix the `.env.local` first.
- **Supabase anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is already set and working — this is for the browser client and auth.
- **The webhook uses the admin client** which needs `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS. Without it the webhook returns 500 on every message.
- **Twilio sender is already approved** for WhatsApp — no need to re-register. Just configure the webhook URL.
- **Arabic-first**: all AI responses default to Arabic if the user writes in Arabic. The `detectLanguage()` function checks for Arabic Unicode characters (`\u0600-\u06FF`).
- **Off-topic guard**: if a customer asks something unrelated to the restaurant, the AI returns `aiAgent.off_topic_response` instead of making up an answer.
- **The Supabase project is on the Free tier** — be mindful of connection limits and function invocations.

---

*Generated by Claude (Cowork mode) — April 5, 2026*
