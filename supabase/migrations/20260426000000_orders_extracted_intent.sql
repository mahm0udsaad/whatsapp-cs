-- =============================================================================
-- orders.extracted_intent — AI-extracted structured context for approval cards.
--
-- When an escalation / reservation order is created, a follow-up job calls
-- Gemini with the conversation history and asks it to extract the structured
-- details the manager needs to act (customer name, phone, party size, date,
-- time, notes, a short Arabic summary, missing fields, a suggested next
-- action, and a ready_to_act flag).
--
-- The column is nullable because:
--   - extraction is best-effort (fire-and-forget after order insert);
--   - older rows created before this migration don't have one and the
--     mobile UI must gracefully fall back to the raw message.
--
-- Idempotent: safe to re-run.
-- =============================================================================

alter table public.orders
  add column if not exists extracted_intent jsonb;

comment on column public.orders.extracted_intent is
  'AI-extracted structured context from the conversation. Shape: { kind, summary, provided: { customer_name?, phone?, party_size?, date?, time?, notes? }, missing: string[], suggested_action, ready_to_act, extracted_at }. Null when extraction has not yet run or failed.';
