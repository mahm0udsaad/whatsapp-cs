-- Document the new message_type values introduced for interactive WhatsApp
-- session messages (list pickers and quick-reply buttons). The column is
-- intentionally free-text — values are defined and validated in application
-- code (src/lib/ai-reply-jobs.ts and src/app/api/webhooks/twilio/route.ts).
--
-- Allowed values:
--   "text"               - default; plain text message
--   "interactive"        - outbound list / quick-reply we sent (metadata.interactive holds the InteractiveReply payload, metadata.content_sid holds the cached Twilio Content SID)
--   "interactive_reply"  - inbound list/button tap from the customer (metadata.tap holds {id, title, replied_to, raw_body})

comment on column public.messages.message_type is
  'Free-text. One of: text, interactive, interactive_reply. See src/lib/ai-reply-jobs.ts and the Twilio webhook handler.';
