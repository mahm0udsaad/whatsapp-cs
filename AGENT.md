# AGENT.md

## Purpose

This file is the project-specific working guide for any agent operating in this repository.

Treat it like a local skill:

- load this file before making major product or architecture decisions
- follow its constraints when editing code
- prefer its product model over stale assumptions in older docs

This project is not a generic dashboard.
It is a multi-tenant restaurant WhatsApp SaaS.

---

## Product Model

Build this system as:

- a tenant provisioning platform
- a WhatsApp routing layer
- an AI restaurant assistant
- a restaurant control dashboard

Do not optimize first for “nice-looking feature pages”.
Optimize first for:

- tenant correctness
- provisioning correctness
- message routing correctness
- reply reliability
- operational visibility

The commercial promise is:

`A restaurant signs up, gets configured, gets a WhatsApp assistant, and can go live quickly.`

---

## Current State

The repo has already moved beyond the original prototype.

Implemented foundations include:

- tenant-aware onboarding
- tenant-aware root/dashboard routing
- live restaurant settings
- live AI agent settings
- live overview metrics
- live conversations
- live knowledge-base CRUD
- live menu CRUD
- Twilio webhook hardening
- async AI reply queue architecture
- local Supabase migrations for SaaS state and AI reply jobs

Important truth:

- code is ahead of the last confirmed remote database state

So when working here, always distinguish between:

- implemented in code
- present in local migrations
- active in the deployed database

---

## Source Of Truth

When there is a conflict, use this order:

1. actual database schema and migration files
2. current runtime code in `src/lib` and `src/app/api`
3. current dashboard pages
4. older markdown docs

Files that matter most:

- [src/lib/types.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/lib/types.ts)
- [src/lib/tenant.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/lib/tenant.ts)
- [src/lib/onboarding.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/lib/onboarding.ts)
- [src/lib/twilio-provisioning.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/lib/twilio-provisioning.ts)
- [src/lib/ai-reply-jobs.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/lib/ai-reply-jobs.ts)
- [src/app/api/webhooks/twilio/route.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/api/webhooks/twilio/route.ts)
- [src/app/api/internal/process-ai-replies/route.ts](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/src/app/api/internal/process-ai-replies/route.ts)
- [supabase/migrations/20260407193000_saas_foundation.sql](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/supabase/migrations/20260407193000_saas_foundation.sql)
- [supabase/migrations/20260407133000_ai_reply_jobs.sql](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/supabase/migrations/20260407133000_ai_reply_jobs.sql)
- [SAAS_STATE_AND_VISION.md](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/SAAS_STATE_AND_VISION.md)

`AGENT_CONTEXT.md` exists, but treat it as historical context, not current truth.

---

## Core Domain Invariants

Never break these:

1. Every inbound WhatsApp message must resolve to exactly one restaurant tenant.
2. Every restaurant must have at most one active AI agent unless the schema is intentionally expanded.
3. Webhook handling must be idempotent by Twilio message SID.
4. Inbound messages must be persisted before heavy AI work.
5. AI generation should not block the webhook critical path.
6. Tenant data must never leak across restaurants.
7. Dashboard pages should prefer real tenant data over placeholders.

If a proposed change weakens any of the above, treat it as a regression.

---

## Architecture Rules

### Tenant Model

Assume:

- one authenticated owner maps to one restaurant
- one restaurant has one active AI agent
- one restaurant can have one or more WhatsApp numbers over time
- one restaurant should trend toward one Twilio subaccount

### Routing Model

The routing key is the WhatsApp number or sender.

Target flow:

`incoming number -> whatsapp sender/number record -> restaurant -> active ai_agent`

Do not reintroduce loose routing that relies on demo data or manual assumptions.

### Async Reply Model

Preferred production flow:

1. webhook validates request
2. webhook resolves tenant
3. webhook persists inbound message
4. webhook enqueues AI reply job
5. worker/cron processes queue
6. worker sends outbound message
7. status callback updates message status

Avoid moving Gemini or other LLM work back into the synchronous webhook unless explicitly asked.

---

## Database And Migration Rules

Before making schema-sensitive changes:

- inspect the latest migration files
- inspect the live-access code paths using the schema
- keep TypeScript types aligned with SQL

When adding schema:

- prefer additive migrations
- preserve existing tenant data where possible
- seed or backfill when the migration introduces a new operational table
- add indexes for routing, status lookup, and tenant lookup

When the remote DB is not confirmed migrated:

- do not claim a feature is live just because code exists
- say clearly whether the feature is gated on migration apply

---

## Twilio Rules

Twilio work in this repo should follow these principles:

- validate inbound requests
- dedupe inbound messages by Twilio SID
- persist outbound message SID
- update delivery state from callbacks
- prefer a provider/ISV model, not one-off manual tenant hacks

Current direction:

- one restaurant should eventually have its own Twilio subaccount
- number inventory and assignment should be explicit
- sender provisioning should evolve toward proper WhatsApp sender registration

Do not simplify the model back into “just store one phone number on restaurants” unless the change is clearly temporary and documented.

---

## UI / UX Rules

This product is operational SaaS software.

UI work should optimize for:

- clarity
- fast setup
- low-friction onboarding
- obvious tenant state
- visible operational status

Dashboard pages should answer:

- is this restaurant configured?
- is the agent active?
- is the number assigned?
- are messages flowing?
- what is failing right now?

Do not spend time polishing secondary screens while core setup, routing, or observability is broken.

---

## Priority Order For Future Work

When choosing what to do next, prefer this order:

1. schema and type correctness
2. onboarding and provisioning reliability
3. webhook and async reply reliability
4. tenant-safe CRUD for core restaurant data
5. observability and operator tooling
6. marketing and campaign features
7. cosmetic polish

If a task competes with production reliability, reliability wins.

---

## Files And Areas By Responsibility

### Tenant and identity

- `src/lib/tenant.ts`
- `src/app/page.tsx`
- `src/app/(dashboard)/layout.tsx`
- `src/app/api/onboarding/route.ts`

### Restaurant and agent configuration

- `src/lib/onboarding.ts`
- `src/app/api/dashboard/restaurant/route.ts`
- `src/app/api/dashboard/ai-agent/route.ts`
- `src/app/(dashboard)/dashboard/restaurant/page.tsx`
- `src/app/(dashboard)/dashboard/ai-agent/page.tsx`

### WhatsApp and Twilio

- `src/lib/twilio.ts`
- `src/lib/twilio-provisioning.ts`
- `src/app/api/webhooks/twilio/route.ts`
- `src/app/api/webhooks/twilio/status/route.ts`

### Async AI replies

- `src/lib/ai-reply-jobs.ts`
- `src/app/api/internal/process-ai-replies/route.ts`

### Knowledge and menu

- `src/app/api/dashboard/knowledge-base/`
- `src/app/api/dashboard/menu/`
- `src/app/api/menu/crawl/route.ts`
- `src/components/dashboard/knowledge-base-manager.tsx`
- `src/components/dashboard/menu-manager.tsx`

### Schema

- `supabase/migrations/`

---

## Common Mistakes To Avoid

- Do not trust old docs over current SQL and runtime code.
- Do not add mock data to pages that already have real tenant data paths.
- Do not call the AI inline in the webhook if the queue path exists.
- Do not hardcode restaurant identity into layouts or dashboard components.
- Do not use stale field names from the old type model.
- Do not assume the remote DB already has local migrations applied.
- Do not describe Twilio provisioning as complete if Meta/Twilio sender activation is still scaffolded.

---

## Expected Validation

After meaningful changes, validate with:

```bash
npx tsc --noEmit
```

And run targeted lint checks on changed files, for example:

```bash
npx eslint path/to/changed/file.ts path/to/changed/component.tsx
```

When touching schema-sensitive code, also inspect:

- migration files
- corresponding API routes
- shared types

When touching message flow, inspect together:

- webhook route
- job queue library
- worker route
- status callback route
- Twilio helper

---

## Documentation Rule

If you make a material architecture or product-state change, update:

- [SAAS_STATE_AND_VISION.md](/Users/mahmoudmac/Documents/Projects/whatsapp-cs/SAAS_STATE_AND_VISION.md)

If the change supersedes old context, prefer updating current docs rather than extending stale ones.

---

## Working Heuristic

When in doubt, ask:

`Does this change make the product more tenant-safe, more operational, and closer to a real restaurant WhatsApp SaaS?`

If yes, continue.
If not, reconsider the change.
