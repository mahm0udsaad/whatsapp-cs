# Tenant knowledge-base seeding

This doc covers how to bootstrap a NEW tenant's RAG store from a folder of
Markdown files. It is **not** the commercial onboarding wizard
(`/onboarding/*`) — that path stays untouched and is still the right entry
point for self-serve sign-ups.

## When to use the seeder

- A tenant arrives with pre-scraped or pre-curated business content (menus,
  service catalog, FAQ, policies) in Markdown form.
- You're re-ingesting after the Business Intel pass produced an updated
  knowledge pack.
- A super-admin needs to wipe and refill an existing tenant's
  `knowledge_chunks` rows from a local folder.

## What the seeder does

1. Validates the target `restaurants` row exists. Aborts otherwise.
2. Wipes every existing `knowledge_chunks` row for that tenant.
3. Chunks each `.md` file into ~500-char overlapping windows.
4. Embeds chunks via Google's `gemini-embedding-001` with
   `outputDimensionality: 768` (matches the existing `vector(768)` column).
   Free-tier quota-aware: ≤10 items per request, 7 s between batches, single
   retry with backoff on 429.
5. Inserts chunks + embeddings into `knowledge_chunks` (50 rows per batch).
6. Upserts an active `ai_agents` row with Arabic defaults
   (`name='أمينة'`, `language_preference='ar'`,
   `personality='دافئة ومحترفة'`, `is_active=true`,
   `system_instructions=''`) so the customer-service template is the
   primary voice driver.

It does **not** seed any operational data — no customers, no orders, no
reservations, no phone numbers, no per-customer reservations. Aggregate or
descriptive content only.

## How to run

```bash
# Dry-run (no DB writes, no embed calls):
npm run seed:tenant-knowledge -- --dry-run <restaurant_id> <folder_path>

# Actual seed:
npm run seed:tenant-knowledge -- <restaurant_id> <folder_path>

# Kiara helper (stages knowledge-base/kiara/ + kiara-kowndge-base/ then runs):
npm run seed:kiara              # actual run
npm run seed:kiara -- --dry-run # plan-only
```

The Kiara restaurant_id is hard-coded in `scripts/seed-kiara.ts`
(`2ba8f6c8-aff9-4147-8f13-cdcb732de698`). For other tenants use the generic
`seed:tenant-knowledge` form.

## Privacy contract enforced upstream

The Business Intel pass that produces the input MD files is forbidden from
including:

- Any customer name, phone, email, address, customer ID, customer notes.
- Any specific reservation date tied to a customer.
- Any subscription tied to a customer.
- Any auth tokens or internal UUIDs (it uses names instead).
- Any staff personal info (phone, national ID, etc.).

The seeder trusts that contract — it does not re-validate it. If you receive
a knowledge folder from outside the team, eyeball at least one file from
each topic (services, providers, policies) before running the seeder.

## Embedding model + dimension

- Model: `gemini-embedding-001`
- Output dimension: `768` (set via `providerOptions.google.outputDimensionality`)
- Storage column: `public.knowledge_chunks.embedding vector(768)`
- Retrieval RPC: `public.match_knowledge_chunks(...)` (cosine, threshold 0.4)

If you ever change the model or dimension, you MUST also change the column
type and re-ingest every tenant — mismatched dims cause silent insert
failures.

## Why no super-admin re-ingest button

The `/dashboard/knowledge-base` page operates on the legacy `knowledge_base`
plain-text table populated by the website crawler — not on
`knowledge_chunks`. There is no source folder stored for an existing tenant
to "re-ingest from", so a one-click re-ingest button there would be
misleading. Use the CLI seeders instead. If we later persist uploaded MDs in
storage, the route to add would be `POST /api/internal/reingest-knowledge`.

## Sanity check on completion

After seeding, verify in Supabase:

```sql
select count(*) as total_chunks, count(distinct source_file) as files
from public.knowledge_chunks
where restaurant_id = '<your_restaurant_id>';
```

You should see one row per source_file matching your input folder.
