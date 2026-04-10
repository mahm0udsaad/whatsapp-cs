# WhatsApp Business API Compliance Rules

## Rules Implemented in This Codebase

### 1. 24-Hour Session Window
- After a customer sends an inbound message, businesses have 24 hours to send free-form replies
- Outside the 24-hour window, only pre-approved template messages can be sent
- Sending free-form messages outside the window results in Twilio error 63016
- **Implementation:** `src/lib/session-window.ts` + check in `src/lib/ai-reply-jobs.ts`
- `last_inbound_at` tracked on `conversations` table, updated on every inbound message

### 2. Opt-Out / Opt-In
- Businesses must process opt-out requests immediately
- **Opt-out keywords:** stop, unsubscribe, cancel, (Arabic equivalents)
- **Opt-in keywords:** start, subscribe, (Arabic equivalents)
- **Implementation:** Handled in webhook route, stored in `opt_outs` table
- Opted-out users receive no responses (messages silently ignored)
- Confirmation messages sent in detected language on opt-out/opt-in

### 3. Message Idempotency
- Duplicate messages (same Twilio MessageSid) are rejected
- Check via `external_message_sid` unique index on messages table

### 4. Webhook Signature Validation
- Twilio signs every request with `X-Twilio-Signature` header (HMAC-SHA1)
- Validated using Twilio SDK helper in webhook route

---

## Rules NOT Yet Implemented (Future Work)

### Template Messages
- No flow to submit templates to Meta for approval
- `marketing_templates` table exists but templates can't be sent outside the 24h window yet
- Need: template submission API, approval status tracking, template sending in campaigns

### BSUID Migration (Deadline: June 2026)
- WhatsApp replacing phone-based user IDs with Business Scoped User IDs
- New `ExternalUserId` field will appear in Twilio webhook payloads
- Must store BSUID alongside phone numbers
- Must update routing logic to support both identifiers during transition

### US Marketing Restriction
- As of April 2025, Meta paused marketing message sending to US users
- Utility, authentication, and session replies still work
- If targeting US users with campaigns, messages will silently fail

### Quality Rating Monitoring
- Meta assigns quality ratings (Green/Yellow/Red) per phone number
- Red for 7+ days causes automatic limit downgrades
- No monitoring dashboard implemented yet

### Messaging Limits (Outside 24h Window)
- New accounts: 250 unique users/day
- Tier 1: 1,000 / Tier 2: 10,000 / Tier 3: 100,000 / Tier 4: Unlimited
- Auto-upgrade by maintaining high quality over 7 days at 50%+ usage
- These limits only apply to business-initiated conversations (templates)

---

## Twilio Rate Limits

| Type | Default | Max |
|------|---------|-----|
| Outbound MPS (text + media) | 80 MPS per sender | 400 MPS (text only, by request) |
| Media throughput | 80 MPS | Cannot be increased |
| Message queue timeout | 4 hours | Messages exceeding throughput queue, then fail |

---

## Meta Pricing (As of July 2025)

- **Within 24h window:** Free (utility templates also free)
- **Marketing templates:** Always charged per delivery
- **Authentication templates:** Always charged per delivery
- **Service conversations:** No additional charge within session window
