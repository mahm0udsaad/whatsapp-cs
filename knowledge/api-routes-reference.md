# API Routes Reference

## Public Routes (No Auth Required)

### `POST /api/webhooks/twilio`
Twilio WhatsApp inbound message webhook.
- Validates Twilio signature
- Rate limits by customer phone (60/min)
- Handles opt-out/opt-in keywords
- Resolves restaurant by incoming number
- Saves message and queues AI reply job
- Returns TwiML XML

### `POST /api/webhooks/twilio/status`
Twilio message delivery status callback.
- Updates message `delivery_status`
- Updates campaign recipient status (delivered/read/failed)

### `POST /api/internal/process-ai-replies`
AI reply worker endpoint. Protected by `AI_REPLY_WORKER_SECRET` bearer token.
- Processes up to 10 pending AI reply jobs
- Checks 24h session window and opt-out status
- Generates Gemini response with KB + menu context
- Sends WhatsApp reply via Twilio

---

## Authenticated Routes (Require Login Session)

### Dashboard API

#### `PATCH /api/dashboard/restaurant`
Update restaurant settings.
- Body: `{ name, country, currency, timezone, website_url, digital_menu_url }`

#### `PATCH /api/dashboard/ai-agent`
Update AI agent settings.
- Body: `{ name, personality, system_instructions, language_preference, off_topic_response }`

#### `POST /api/dashboard/provisioning`
Retry WhatsApp provisioning for the restaurant.

#### `GET /api/dashboard/knowledge-base`
List knowledge base entries for the restaurant.

#### `POST /api/dashboard/knowledge-base`
Create a new knowledge base entry.
- Body: `{ title, content, source_type }`

#### `PATCH /api/dashboard/knowledge-base/[id]`
Update a knowledge base entry.

#### `DELETE /api/dashboard/knowledge-base/[id]`
Delete a knowledge base entry.

#### `GET /api/dashboard/menu`
List menu items for the restaurant.

#### `POST /api/dashboard/menu`
Create a new menu item.
- Body: `{ name_ar, name_en, description_ar, description_en, price, category, is_available }`

#### `PATCH /api/dashboard/menu/[id]`
Update a menu item.

#### `DELETE /api/dashboard/menu/[id]`
Delete a menu item.

### Menu Crawl

#### `POST /api/menu/crawl`
Crawl a URL and extract menu items. Requires auth + rate limited (5/min).
- Body: `{ restaurant_id, url }`
- SSRF protection: blocks localhost, private IPs, non-http protocols
- Returns: `{ items_extracted, items, knowledge_base_entries }`

### Onboarding

#### `POST /api/onboarding`
Create/update restaurant during onboarding wizard.
- Body: `OnboardingPayload` (restaurant name, country, currency, agent config, etc.)
- Creates profile, restaurant, AI agent, starter KB entries
- Triggers Twilio provisioning

---

## Dashboard Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/dashboard` | Overview | Stats cards, recent conversations, AI agent status, readiness checklist |
| `/dashboard/conversations` | ConversationsInbox | Real-time message view with search/filter |
| `/dashboard/ai-agent` | AiAgentSettingsForm | Personality, instructions, language, off-topic response |
| `/dashboard/knowledge-base` | KnowledgeBaseManager | CRUD for KB entries with stats |
| `/dashboard/menu` | MenuManager | Manual CRUD + URL crawl import |
| `/dashboard/restaurant` | RestaurantSettingsForm | Business info, provisioning retry |
| `/dashboard/marketing` | Marketing | Campaign management |
