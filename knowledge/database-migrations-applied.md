# Database Migrations Applied to Remote Supabase

**Project:** `nkdkqgrkyqpjdaifazwn` (whatsapp-cs, eu-central-1)

## Pre-existing Migrations (already applied before this session)

| Version | Name | Description |
|---------|------|-------------|
| 20260330040033 | `enable_extensions` | pgvector, etc. |
| 20260330040147 | `create_core_tables` | profiles, restaurants, ai_agents, conversations, messages, knowledge_base, menu_items, marketing_templates, marketing_campaigns, campaign_recipients |
| 20260330040234 | `add_rls_and_functions` | RLS policies, update_updated_at trigger, match_knowledge_base vector search |
| 20260407010051 | `add_missing_campaign_recipients_columns` | Campaign recipient tracking columns |
| 20260407022245 | `add_missing_messages_columns` | external_message_sid, delivery_status, error_message |

## New Migrations (applied April 8, 2026)

### 1. `ai_reply_jobs`
```sql
-- ai_reply_jobs table (durable async queue)
-- Unique index on inbound_message_id
-- Status + created_at index for worker polling
-- RLS enabled
-- set_updated_at trigger
```

### 2. `saas_foundation`
```sql
-- whatsapp_numbers table (phone inventory)
-- provisioning_runs table (audit trail)
-- Extended restaurants: primary_whatsapp_number_id, provisioning_status, timestamps, metadata
-- Extended ai_agents: max_context_messages, temperature
-- Extended messages: twilio_message_sid, twilio_status, external_error_code, channel
-- Data migration: seed whatsapp_numbers from restaurants, backfill provisioning
-- RLS + policies on new tables
-- Triggers for updated_at
```

### 3. `fix_function_search_paths_and_rls`
```sql
-- Fixed search_path on: update_updated_at, set_updated_at, set_updated_at_timestamp, match_knowledge_base
-- Created opt_outs table
-- Added last_inbound_at to conversations
-- Created webhook_events table
-- RLS on new tables
```

### 4. `add_conversation_auto_resolve`
```sql
-- auto_resolve_stale_conversations() function
-- pg_cron job: hourly auto-resolve
```

### 5. `fix_remaining_search_paths_and_rls_v2`
```sql
-- Drop/recreate match_knowledge_base second overload with fixed search_path
-- RLS policies for opt_outs and webhook_events
```

## Active pg_cron Jobs

| Job ID | Name | Schedule | Command |
|--------|------|----------|---------|
| 1 | `auto-resolve-stale-conversations` | `0 * * * *` | `select public.auto_resolve_stale_conversations()` |
| 2 | `process-ai-replies-worker` | `* * * * *` | HTTP POST to Edge Function |

## Active Edge Functions

| Name | Status | JWT Required | Trigger |
|------|--------|-------------|---------|
| `process-ai-replies` | ACTIVE | No | pg_cron every minute |

## Security Advisor Status (Post-Fix)

| Issue | Level | Status |
|-------|-------|--------|
| `function_search_path_mutable` | WARN | RESOLVED (all functions fixed) |
| `rls_enabled_no_policy` on `ai_reply_jobs` | INFO | Intentional (service-role only table) |
| `auth_leaked_password_protection` | WARN | MANUAL ACTION NEEDED (Supabase Dashboard) |
