# WhatsApp CS SaaS State, Vision, and Deployment Brief

Last updated: April 7, 2026

## Purpose

This document is the current project handoff.

It captures:

- what was investigated in the repo and live Supabase data
- what has been implemented in the codebase so far
- what changes become active only after the Supabase migrations are applied
- what changes become active only after the AI reply cron/worker is enabled
- the marketing/product vision for the SaaS
- the technical architecture and operating model
- the official references that informed the architecture decisions

This document is intentionally written to separate:

- current implemented code state
- post-migration state
- post-cron operational state

That distinction matters because the code has advanced further than the currently linked remote database.

---

## 1. Executive Summary

`whatsapp-cs` started as a dashboard-heavy prototype for a restaurant WhatsApp AI assistant.

It is now being converted into a multi-tenant SaaS with these core capabilities:

- tenant-aware onboarding
- restaurant-scoped AI agent configuration
- Twilio number and sender assignment foundations
- WhatsApp inbound routing by tenant
- live operational dashboard pages backed by Supabase
- durable message tracking
- an async AI reply queue

At this point, the repo contains the main SaaS foundation locally.

The remaining activation steps are external and deployment-related:

- apply the Supabase migrations to the real project
- schedule the internal AI reply processor route with cron or a worker
- finish Twilio WhatsApp sender activation for a full production onboarding path

After those steps, the product becomes a tenant-operational MVP rather than a partially connected prototype.

---

## 2. Project State At A Glance

### 2.1 What Was Investigated

Investigation covered three layers:

- the local codebase structure and route organization
- the live Supabase database exposed through the project environment variables
- the official product and infrastructure references for Twilio, Supabase, Next.js, UX, and deployment

### 2.2 Live Database Findings

The live project already had real data behind it:

- `profiles`: 1
- `restaurants`: 1
- `ai_agents`: 1
- `conversations`: 1
- `messages`: 20
- `knowledge_base`: 0
- `menu_items`: 0
- marketing tables: effectively empty

The database confirmed that the app had a real backend spine, but also exposed drift between the live schema and the old shared TypeScript types.

Examples of drift that were found:

- `restaurants.owner_id` instead of older `user_id`
- `messages.role` instead of older `sender`
- `conversations.started_at` instead of older `created_at`
- `menu_items.name_ar/name_en/.../is_available` instead of the older simplified menu shape

### 2.3 Main Conclusion From Investigation

The repo was not just missing polish.

It was missing a proper SaaS model:

- tenant provisioning
- number inventory and assignment
- durable operational state
- async reply processing
- dashboard pages backed by real data instead of mock state

That is why the work focused on architecture and operations first, not on marketing pages.

---

## 3. Marketing Vision

### 3.1 Product Positioning

This product should be sold as:

`A WhatsApp-native AI receptionist and customer support layer for restaurants.`

It should not be positioned as:

`a generic chatbot dashboard`

Restaurant owners do not buy dashboard software.
They buy:

- faster replies
- fewer missed questions
- better customer coverage during rush hours and off hours
- easier onboarding for staff
- a branded WhatsApp presence that feels responsive

### 3.2 Ideal Customer Profile

Best early ICP:

- single-location restaurants
- small chains
- restaurants in WhatsApp-heavy markets
- operators already handling support manually through WhatsApp
- businesses with an accessible menu URL or at least a structured menu file

### 3.3 Core Promise

The product promise should be:

`Set up your restaurant, get a WhatsApp assistant, connect your menu, and start answering customers automatically.`

### 3.4 Why The Product Can Win

The strongest commercial angle is not generic AI.

It is the combination of:

- restaurant-specific workflows
- WhatsApp-first delivery
- fast setup
- editable knowledge and menu data
- one operational control plane for the business owner

### 3.5 Packaging Direction

Recommended commercial packaging:

- `Starter`
  - one restaurant
  - one WhatsApp sender
  - basic KB and menu
  - limited monthly message volume

- `Growth`
  - higher message limits
  - templates and campaigns
  - richer analytics
  - more automation controls

- `Scale`
  - multi-branch
  - multiple senders
  - advanced routing and reporting
  - operator tooling

### 3.6 What Must Be True Before Selling

The product becomes truly marketable only when all of this is working:

- onboarding creates a real tenant
- each tenant gets a real WhatsApp number or sender path
- inbound messages route to the correct tenant
- replies are reliable
- the restaurant can improve the bot with KB and menu updates
- failures are visible and debuggable

That commercial threshold is what drove the technical work below.

---

## 4. Technical Vision

### 4.1 Product Architecture

This project should now be understood as five systems working together:

- a tenant provisioning system
- a Twilio routing and sender layer
- a restaurant knowledge layer
- an AI reply pipeline
- a dashboard control plane

It is no longer accurate to think of it as just a frontend dashboard with a few helper APIs.

### 4.2 Tenant Model

Recommended core mapping:

- one Supabase Auth user owns one restaurant tenant
- one restaurant owns one active AI agent
- one restaurant can own one or more WhatsApp numbers over time
- one restaurant should eventually map to one Twilio subaccount
- inbound routing should always resolve from incoming sender/number to one restaurant

### 4.3 Operating Principle

The routing key for the product is the WhatsApp number or sender.

That means every incoming message must reliably map:

`incoming number -> sender/number record -> restaurant -> active AI agent`

This invariant is more important than any dashboard feature.

---

## 5. What Was Implemented

### 5.1 Type and Schema Alignment

The shared type layer was rebuilt in [src/lib/types.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/lib/types.ts) so the app matches the real database shape and the new SaaS model.

This removed stale assumptions around:

- restaurants ownership fields
- message roles
- conversation timestamps
- menu and KB structures
- provisioning entities
- Twilio-related entities

### 5.2 Tenant Resolution Layer

[src/lib/tenant.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/lib/tenant.ts) now centralizes tenant lookup.

It provides:

- current user resolution
- restaurant resolution by user
- active AI agent lookup
- tenant context loading for server-rendered dashboard pages

### 5.3 Real Onboarding Flow

The onboarding path is now a real provisioning entrypoint:

- UI: [src/app/(onboarding)/onboarding/page.tsx](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/(onboarding)/onboarding/page.tsx)
- API: [src/app/api/onboarding/route.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/api/onboarding/route.ts)
- Logic: [src/lib/onboarding.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/lib/onboarding.ts)

This flow now creates or updates:

- `profiles`
- `restaurants`
- `ai_agents`
- starter `knowledge_base` entries
- Twilio provisioning attempts when the supporting tables exist

### 5.4 Tenant-Aware App Routing

The app root and dashboard shell were converted so they route based on the actual tenant state:

- [src/app/page.tsx](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/page.tsx)
- [src/app/(dashboard)/layout.tsx](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/(dashboard)/layout.tsx)
- [src/components/dashboard/dashboard-shell.tsx](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/components/dashboard/dashboard-shell.tsx)

This replaced hardcoded dashboard identity data with real tenant-scoped data.

### 5.5 Dashboard Pages Converted From Mock To Live

These pages are now backed by Supabase instead of demo arrays or local-only state:

- overview: [src/app/(dashboard)/dashboard/page.tsx](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/(dashboard)/dashboard/page.tsx)
- conversations: [src/app/(dashboard)/dashboard/conversations/page.tsx](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/(dashboard)/dashboard/conversations/page.tsx)
- restaurant settings: [src/app/(dashboard)/dashboard/restaurant/page.tsx](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/(dashboard)/dashboard/restaurant/page.tsx)
- AI agent settings: [src/app/(dashboard)/dashboard/ai-agent/page.tsx](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/(dashboard)/dashboard/ai-agent/page.tsx)
- knowledge base: [src/app/(dashboard)/dashboard/knowledge-base/page.tsx](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/(dashboard)/dashboard/knowledge-base/page.tsx)
- menu: [src/app/(dashboard)/dashboard/menu/page.tsx](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/(dashboard)/dashboard/menu/page.tsx)

Supporting client components and APIs were added under:

- [src/components/dashboard](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/components/dashboard)
- [src/app/api/dashboard](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/api/dashboard)

### 5.6 Twilio Webhook Hardening

The inbound WhatsApp webhook and status callback were upgraded:

- [src/app/api/webhooks/twilio/route.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/api/webhooks/twilio/route.ts)
- [src/app/api/webhooks/twilio/status/route.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/api/webhooks/twilio/status/route.ts)
- [src/lib/twilio.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/lib/twilio.ts)

Key improvements:

- request signature validation using Twilio’s SDK approach
- deduplication by inbound `MessageSid`
- durable inbound message persistence
- outbound message SID persistence
- status callback updates into the messages table

### 5.7 Twilio Provisioning Scaffolding

[src/lib/twilio-provisioning.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/lib/twilio-provisioning.ts) now provides the first operational provisioning layer.

It currently supports:

- Twilio incoming number sync into inventory
- primary platform number inventory seeding
- subaccount creation per restaurant
- available number assignment
- sender record creation/update
- provisioning run recording

There is also a retry path exposed from the dashboard:

- [src/app/api/dashboard/provisioning/route.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/api/dashboard/provisioning/route.ts)

This is not yet the full Meta Embedded Signup plus Twilio Senders API production flow, but it establishes the control-plane model.

### 5.8 Async AI Reply Pipeline

The largest backend architecture upgrade was moving AI response generation off the synchronous webhook path.

Implemented pieces:

- queue library: [src/lib/ai-reply-jobs.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/lib/ai-reply-jobs.ts)
- internal processor route: [src/app/api/internal/process-ai-replies/route.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/api/internal/process-ai-replies/route.ts)
- webhook enqueue path: [src/app/api/webhooks/twilio/route.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/api/webhooks/twilio/route.ts)

Current async flow:

1. inbound webhook validates and persists the message
2. inbound webhook creates an `ai_reply_job`
3. webhook returns quickly
4. internal worker route processes pending jobs
5. worker loads restaurant, agent, conversation, KB, and menu context
6. Gemini generates the response
7. Twilio sends the outbound message
8. outbound message row and Twilio status metadata are stored

This is the right production direction because the webhook is no longer blocked on LLM latency.

### 5.9 Menu Crawl Alignment

The menu crawler was also updated so it writes into the current menu schema shape:

- [src/app/api/menu/crawl/route.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/api/menu/crawl/route.ts)

That keeps crawl-imported menu items compatible with the live dashboard and the AI reply context builder.

---

## 6. Migration Layer

### 6.1 Migrations Added Locally

The current repo includes these migration files:

- [supabase/migrations/20260407193000_saas_foundation.sql](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/supabase/migrations/20260407193000_saas_foundation.sql)
- [supabase/migrations/20260407133000_ai_reply_jobs.sql](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/supabase/migrations/20260407133000_ai_reply_jobs.sql)

### 6.2 What The SaaS Foundation Migration Adds

The SaaS foundation migration adds or extends the following model:

- `whatsapp_numbers`
- `provisioning_runs`
- `restaurants.primary_whatsapp_number_id`
- `restaurants.provisioning_status`
- restaurant activation timestamps and metadata
- `ai_agents.max_context_messages`
- `ai_agents.temperature`
- `messages.twilio_message_sid`
- `messages.twilio_status`
- `messages.external_error_code`
- `messages.channel`

It also seeds `whatsapp_numbers` and `provisioning_runs` from existing restaurant data where possible.

### 6.3 What The AI Reply Jobs Migration Adds

The AI reply jobs migration adds:

- `ai_reply_jobs`

This table is the durable queue that lets inbound messages be acknowledged quickly and processed later by the worker.

### 6.4 Current Truth About Migrations

The migrations are present in the repo.

They have not yet been confirmed as applied to the remote Supabase project from this environment because the local Supabase CLI session was not authenticated when checked.

That means this document should be read carefully as:

- code implemented: yes
- local migrations prepared: yes
- remote migration apply confirmed from this session: no

---

## 7. Post-Migration State

Once the migrations are applied to the real database, the system model becomes materially stronger.

### 7.1 New Runtime Capabilities After Migration

After migration, the app can reliably persist:

- WhatsApp number inventory
- provisioning/audit runs
- restaurant-level provisioning state
- outbound Twilio message metadata
- AI reply queue jobs

### 7.2 Practical Product Changes After Migration

After migration, onboarding can do more than create a restaurant and an agent.

It can also:

- allocate or confirm a WhatsApp number record
- record provisioning steps durably
- track setup progress as state instead of implicit behavior
- power operational dashboards and retries from stored records

### 7.3 Recommended Migration Apply Commands

Suggested sequence:

```bash
supabase login
supabase link --project-ref nkdkqgrkyqpjdaifazwn
supabase db push
```

If the project is already linked, only `supabase db push` is needed.

### 7.4 Post-Migration Smoke Test

After pushing migrations, verify:

1. create or update a tenant from onboarding
2. confirm rows appear in:
   - `whatsapp_numbers`
   - `provisioning_runs`
   - `ai_reply_jobs` after an inbound message
3. send a WhatsApp inbound message
4. confirm inbound row appears in `messages`
5. confirm worker processing creates an outbound `messages` row
6. confirm Twilio callback updates the delivery state

---

## 8. Cron / Worker State

### 8.1 What Is Already Implemented

The processing route already exists:

- [src/app/api/internal/process-ai-replies/route.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/api/internal/process-ai-replies/route.ts)

It:

- validates an optional bearer token using `AI_REPLY_WORKER_SECRET`
- processes up to 10 pending AI reply jobs per invocation

### 8.2 What Cron Activates

Cron does not add new business logic.

Cron activates the async architecture that is already in the repo.

Without cron or a worker:

- inbound jobs can be queued
- queued jobs will sit pending

With cron or a worker:

- pending jobs are processed continuously
- the full async reply pipeline becomes operational

### 8.3 Recommended MVP Cron Model

Recommended first deployment model:

- run every minute
- process a bounded batch
- protect the endpoint with `AI_REPLY_WORKER_SECRET`

Example `vercel.json` shape:

```json
{
  "crons": [
    {
      "path": "/api/internal/process-ai-replies",
      "schedule": "* * * * *"
    }
  ]
}
```

If you keep `AI_REPLY_WORKER_SECRET` enabled, the scheduler or proxy calling the route must send:

```http
Authorization: Bearer <AI_REPLY_WORKER_SECRET>
```

### 8.4 Post-Cron State

After cron is enabled, the runtime model becomes:

1. customer sends inbound WhatsApp message
2. webhook validates, resolves tenant, stores inbound message, enqueues job, returns
3. cron hits `/api/internal/process-ai-replies`
4. queued jobs are processed
5. Gemini generates the answer
6. Twilio sends the outbound message
7. status callback updates delivery state

That is the operational MVP architecture.

---

## 9. Product State After Migration And Cron

Once both the migrations and the reply worker scheduling are active, the product is meaningfully different from the original prototype.

### 9.1 What The User Experience Becomes

For a restaurant owner:

1. sign up
2. complete onboarding
3. get a configured tenant and agent
4. manage restaurant settings, bot instructions, KB, and menu
5. receive inbound messages on the assigned number
6. have replies generated asynchronously and delivered reliably

### 9.2 What The Operator Experience Becomes

For the platform operator:

- restaurants have provisioning state
- numbers are inventory-backed
- inbound/outbound messages are traceable
- delivery states are persisted
- failed provisioning or failed replies become observable entities, not hidden behavior

### 9.3 Why This Matters Commercially

This is the point at which the product stops being “feature pages that look complete” and becomes:

- operable
- supportable
- diagnosable
- sellable

That is the threshold between a prototype and an MVP that can handle real customers.

---

## 10. Gaps Still Open

Even after migration and cron, some important work remains.

### 10.1 Twilio WhatsApp Activation Completeness

The current provisioning layer is a strong foundation, but it is not yet the full production sender onboarding flow.

Still needed:

- Meta Embedded Signup
- Twilio Senders API registration flow
- clearer sender activation states
- potentially per-tenant business verification handling

### 10.2 Middleware Setup-State Enforcement

The app now routes more intelligently, but `setup_status` or `provisioning_status` is not yet enforced everywhere in middleware.

That should be added so partially configured tenants cannot drift into unsupported states.

### 10.3 Observability

Still recommended:

- operator screens for provisioning failures
- operator screens for AI reply job failures
- alerting for repeated worker failures
- metrics for queued job age and processing latency

### 10.4 Marketing Surfaces

The core app is now ahead of the marketing module.

That is fine strategically, because the operational path had to be fixed first.
But it means campaigns/templates remain secondary until the provisioning and reply pipeline are fully stable in production.

---

## 11. Deployment Checklist

### 11.1 Environment Variables

Current required environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `GOOGLE_GEMINI_API_KEY`
- `NEXT_PUBLIC_APP_URL`

Recommended addition:

- `AI_REPLY_WORKER_SECRET`

### 11.2 Go-Live Sequence

Recommended order:

1. authenticate Supabase CLI
2. apply migrations
3. confirm onboarding creates provisioning rows
4. set `AI_REPLY_WORKER_SECRET`
5. deploy cron/worker
6. send end-to-end inbound WhatsApp test messages
7. verify delivery statuses update
8. then start external onboarding tests

### 11.3 Validation Already Performed In Code

The code changes were validated with:

- `npx tsc --noEmit`
- targeted `npx eslint ...` runs on changed files

This means the main implementation pass is type-checked and lint-checked locally, but deployment validation still depends on real remote migration and Twilio runtime testing.

---

## 12. Official References Used

The following references informed the architecture and implementation direction.

### Twilio / WhatsApp

- Twilio Tech Provider overview
  - https://www.twilio.com/docs/whatsapp/isv/tech-provider-program
  - Why it mattered: it established the correct ISV/tech-provider framing for a multi-tenant SaaS.

- Twilio Tech Provider integration guide
  - https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/integration-guide
  - Why it mattered: it informed the real-world onboarding direction for restaurant sender activation.

- Twilio Self Sign-up
  - https://www.twilio.com/docs/whatsapp/self-sign-up
  - Why it mattered: it clarified the distinction between direct-customer onboarding and provider-led onboarding.

- Twilio Senders API
  - https://www.twilio.com/docs/whatsapp/api/senders
  - Why it mattered: it is the official API surface for sender registration and management.

- Twilio Subaccounts API
  - https://www.twilio.com/docs/iam/api/subaccounts
  - Why it mattered: it supports the `one restaurant = one Twilio subaccount` direction.

- Twilio webhook security
  - https://www.twilio.com/docs/usage/webhooks/webhooks-security
  - Why it mattered: it informed request validation on inbound webhooks.

- Twilio webhook validation tutorial
  - https://www.twilio.com/docs/usage/tutorials/how-to-secure-your-express-app-by-validating-incoming-twilio-requests
  - Why it mattered: it guided the signature validation approach implemented in the webhook.

- Twilio inbound webhook parameters
  - https://www.twilio.com/docs/messaging/guides/webhook-request
  - Why it mattered: it clarified the request payload shape used for inbound handling.

- Twilio Message resource
  - https://www.twilio.com/docs/messaging/api/message-resource
  - Why it mattered: it informed outbound send handling and message SID persistence.

- Twilio outbound message status callbacks
  - https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks
  - Why it mattered: delivery states are now persisted to messages.

- Twilio outbound logging
  - https://www.twilio.com/docs/messaging/guides/outbound-message-logging
  - Why it mattered: it informed the operational visibility direction for sent messages.

- Twilio Messaging Services
  - https://www.twilio.com/docs/messaging/services
  - Why it mattered: it remains relevant for future notification/campaign layers.

- Twilio WhatsApp key concepts
  - https://www.twilio.com/docs/whatsapp/key-concepts
  - Why it mattered: it clarified the 24-hour session window and sender constraints.

- Twilio Content session definitions
  - https://www.twilio.com/docs/content/session-definitions
  - Why it mattered: it informed the distinction between free-form session replies and template-based outbound messaging.

### Supabase

- Supabase Row Level Security
  - https://supabase.com/docs/guides/database/postgres/row-level-security
  - Why it mattered: it informed tenant-safe access patterns and migration design.

- Supabase Next.js server-side auth guidance
  - https://supabase.com/docs/guides/auth/server-side/nextjs
  - Why it mattered: it supports the tenant-aware server rendering and route design.

- Supabase server-side client creation
  - https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs
  - Why it mattered: it informed the current client/server/admin Supabase organization.

### Next.js / UX / Performance

- Next.js Forms guide
  - https://nextjs.org/docs/app/guides/forms
  - Why it mattered: it informed the onboarding and mutation flow structure.

- web.dev sign-in form best practices
  - https://web.dev/articles/sign-in-form-best-practices
  - Why it mattered: it shaped the onboarding and auth UX direction.

- web.dev sign-up form best practices
  - https://web.dev/articles/sign-up-form-best-practices
  - Why it mattered: it reinforced the decision to keep onboarding focused and progressive.

- web.dev Web Vitals
  - https://web.dev/articles/vitals
  - Why it mattered: it supported the move away from synchronous LLM work in the webhook path.

- Vercel Cron Jobs
  - https://vercel.com/docs/cron-jobs
  - Why it mattered: it is the simplest deployment path for the internal AI reply processor in a Next.js/Vercel environment.

---

## 13. Closing Assessment

At this point, the project is no longer just a UI prototype.

The repo now has a credible SaaS backbone:

- tenant model
- onboarding model
- provisioning model
- live operational dashboard pages
- durable message tracking
- async AI reply architecture

The main remaining gap is not “more UI”.

It is activation:

- remote migrations
- cron/worker scheduling
- complete Twilio WhatsApp sender onboarding
- operational observability

Once those are active, the product becomes a real tenant-operational MVP with a clear market story and a defendable technical design.
