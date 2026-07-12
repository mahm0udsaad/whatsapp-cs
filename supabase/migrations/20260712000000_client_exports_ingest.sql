-- Records the outcome of ingesting an export archive into the live tables
-- (customers + conversations + messages). Set by POST /api/dashboard/export/:id/ingest.
-- New status value 'ingested' means the chat history has been persisted to our DB.

alter table public.client_exports
  add column if not exists ingested_at timestamptz,
  add column if not exists ingest_result jsonb;

comment on column public.client_exports.ingest_result is
  'Counts from persisting the export into live tables: chatsImported, messagesInserted, customersUpserted, mediaUploaded, etc.';
