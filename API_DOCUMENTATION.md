# WhatsApp AI Customer Service API Documentation

## Overview

This document describes the backend API endpoints for the WhatsApp AI customer service platform. The API provides webhooks for receiving WhatsApp messages via Twilio, processing them with AI (Google Gemini), and sending intelligent responses.

## Architecture

```
WhatsApp Message → Twilio → Webhook (route.ts) → Database → AI Processing → Twilio Send → Customer
```

## Environment Variables

All environment variables are stored in `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://nkdkqgrkyqpjdaifazwn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_ANON_KEY

# Twilio
TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER=+966542228723

# Google Gemini
GOOGLE_GEMINI_API_KEY=...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Setup Instructions

1. **SUPABASE_SERVICE_ROLE_KEY**: Get from Supabase dashboard → Settings → API → Service Role Key
2. **GOOGLE_GEMINI_API_KEY**: Get from Google AI Studio (https://aistudio.google.com/app/apikey)

## API Endpoints

### 1. POST /api/webhooks/twilio

**Main webhook endpoint** - Receives WhatsApp messages from Twilio

#### Request

- **Method**: POST
- **Content-Type**: application/x-www-form-urlencoded (Twilio sends form data)
- **Headers**:
  - `X-Twilio-Signature`: HMAC-SHA1 signature for validation

**Request Body** (form-encoded):
```
MessageSid=SM...
From=whatsapp:+966512345678
To=whatsapp:+966542228723
Body=Hello, I would like to order a pizza
NumMedia=0
```

#### Response

Returns TwiML XML (Twilio Markup Language):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>مرحبا! شكراً على رسالتك. يمكنك اختيار من قائمتنا...</Message>
</Response>
```

#### Flow

1. **Parse Request**: Extract From (customer), To (restaurant), Body (message)
2. **Look Up Restaurant**: Find by To phone number
3. **Create/Update Conversation**: Track customer conversation thread
4. **Save Message**: Store incoming customer message
5. **Load AI Agent**: Get restaurant's AI configuration
6. **Query Knowledge Base**: Find relevant menu/FAQ items (pgvector similarity)
7. **Get Menu Context**: Load available items for context
8. **Generate Response**: Call Google Gemini API with RAG context
9. **Save AI Response**: Store generated message
10. **Send Reply**: Send via Twilio WhatsApp API
11. **Return TwiML**: Send response back to Twilio

#### Error Handling

- **Missing restaurant**: Returns 404
- **AI Generation fails**: Sends fallback message
- **Twilio send fails**: Still returns 200 (TwiML is what matters)
- **Database errors**: Logged to console, TwiML still returned

#### Example cURL

```bash
curl -X POST http://localhost:3000/api/webhooks/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM123&From=whatsapp:+966512345678&To=whatsapp:+966542228723&Body=Hello"
```

---

### 2. POST /api/webhooks/twilio/status

**Status callback endpoint** - Tracks message delivery status

#### Request

- **Method**: POST
- **Content-Type**: application/x-www-form-urlencoded

**Request Body** (form-encoded):
```
MessageSid=SM...
MessageStatus=delivered
ErrorCode=
```

#### Response

```json
{
  "success": true
}
```

#### Status Values

- `sent` - Message sent from Twilio
- `delivered` - Message delivered to WhatsApp
- `read` - Customer read the message
- `failed` - Message failed (check ErrorCode)
- `undelivered` - Unable to deliver

#### Usage

Set this URL in Twilio webhook configuration → Status Callback URL:
```
https://yourdomain.com/api/webhooks/twilio/status
```

---

### 3. POST /api/menu/crawl

**Menu crawler endpoint** - Extract menu from restaurant website

#### Request

```json
{
  "restaurant_id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://restaurant.example.com/menu"
}
```

#### Response (Success)

```json
{
  "items_extracted": 42,
  "items": [
    {
      "id": "item-1",
      "name": "Margherita Pizza",
      "price": 45.99,
      "currency": "SAR",
      "category": "Pizza",
      "description": "Classic cheese and tomato",
      "available": true
    }
  ],
  "knowledge_base_entries": 42
}
```

#### Response (Error)

```json
{
  "error": "No menu items found",
  "items_extracted": 0,
  "items": [],
  "knowledge_base_entries": 0
}
```

**Status**: 400 if no items found, 500 on error

#### How It Works

1. **Fetch URL**: Downloads HTML from menu URL (with timeout)
2. **Parse HTML**: Uses Cheerio to parse DOM
3. **Extract Items**: Tries multiple selector patterns:
   - `.menu-item`, `.menu-product`, `.product-item`
   - `.food-item`, `.dish`, `.item`
   - Fallback to `<table>` parsing
4. **Extract Fields**:
   - Name: `.name`, `.title`, `h3`, `h4` text
   - Price: `.price` or currency+number regex
   - Category: `data-category` attribute
   - Image: `<img src>`
   - Description: `.description`, `<p>` text
5. **Detect Currency**: Looks for SAR, AED, $, €, £, etc.
6. **Save to Database**:
   - Inserts into `menu_items` table
   - Creates `knowledge_base` entries for RAG
7. **Return Sample**: First 20 items in response

#### Supported Menu Formats

- E-commerce sites with product cards
- Digital menu platforms
- HTML tables
- Custom menu websites with semantic markup

#### Example cURL

```bash
curl -X POST http://localhost:3000/api/menu/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_id": "550e8400-e29b-41d4-a716-446655440000",
    "url": "https://restaurant.example.com/menu"
  }'
```

---

## Core Libraries

### Types (`src/lib/types.ts`)

TypeScript interfaces for all database tables and API requests:

```typescript
interface Restaurant { id, name, whatsapp_number, ... }
interface AiAgent { id, system_prompt, personality, ... }
interface Message { id, conversation_id, sender, content, ... }
interface MenuItem { id, name, price, category, ... }
interface Conversation { id, customer_phone, status, ... }
interface KnowledgeBase { id, content, embedding, ... }
```

### Supabase Admin (`src/lib/supabase/admin.ts`)

Server-side Supabase client using service role key:

```typescript
import { adminSupabaseClient } from "@/lib/supabase/admin";

// Use in webhooks for unrestricted database access
const { data } = await adminSupabaseClient
  .from("restaurants")
  .select("*")
  .single();
```

### Gemini AI (`src/lib/gemini.ts`)

Google Generative AI integration:

```typescript
import { generateGeminiResponse } from "@/lib/gemini";

const response = await generateGeminiResponse({
  systemPrompt: "You are a helpful restaurant assistant",
  personality: "Friendly and helpful",
  ragContext: "Menu items and FAQ...",
  conversationHistory: [...],
  userMessage: "What do you recommend?",
  languagePreference: "auto",
  offTopicResponse: "I can only help with restaurant questions"
});
// Returns: { content: "...", language: "ar" | "en" }
```

**Features**:
- Arabic-first (detects user language)
- pgvector RAG context support
- Conversation history (last N messages)
- Off-topic detection
- Temperature: 0.7 (customizable)
- Model: `gemini-2.0-flash`

### Twilio (`src/lib/twilio.ts`)

WhatsApp messaging via Twilio:

```typescript
import { sendWhatsAppMessage, validateTwilioRequest } from "@/lib/twilio";

// Send message
const messageSid = await sendWhatsAppMessage(
  "+966512345678",
  "Your message here"
);

// Validate incoming request
const isValid = validateTwilioRequest(url, body, twilioSignature);

// Generate TwiML response
const twiml = generateTwiMLResponse("Message content");
```

---

## Database Schema

### restaurants
```sql
id UUID PRIMARY KEY
user_id UUID
name TEXT
whatsapp_number TEXT UNIQUE
whatsapp_business_account_id TEXT
description TEXT
location TEXT
cuisine_type TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### ai_agents
```sql
id UUID PRIMARY KEY
restaurant_id UUID FOREIGN KEY
name TEXT
system_prompt TEXT
personality TEXT
language_preference ENUM('ar', 'en', 'auto')
off_topic_response TEXT
max_context_messages INTEGER
temperature FLOAT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### messages
```sql
id UUID PRIMARY KEY
conversation_id UUID FOREIGN KEY
sender ENUM('customer', 'ai')
content TEXT
language ENUM('ar', 'en')
metadata JSONB
created_at TIMESTAMP
```

### conversations
```sql
id UUID PRIMARY KEY
restaurant_id UUID FOREIGN KEY
customer_phone TEXT
customer_name TEXT
status ENUM('active', 'archived', 'closed')
last_message_at TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
```

### knowledge_base
```sql
id UUID PRIMARY KEY
restaurant_id UUID FOREIGN KEY
content TEXT
source TEXT
category TEXT
embedding vector(1536)
created_at TIMESTAMP
updated_at TIMESTAMP
```

### menu_items
```sql
id UUID PRIMARY KEY
restaurant_id UUID FOREIGN KEY
name TEXT
description TEXT
price FLOAT
currency TEXT
category TEXT
image_url TEXT
available BOOLEAN
created_at TIMESTAMP
updated_at TIMESTAMP
```

---

## Language Support

### Auto-Detection

The system automatically detects message language:
```typescript
const arabicRegex = /[\u0600-\u06FF]/g; // Arabic Unicode range
const arabicRatio = matches / text.length;
const language = arabicRatio > 0.3 ? "ar" : "en";
```

### Preferences

- **AI Agent `language_preference`**:
  - `"auto"`: Respond in user's language
  - `"ar"`: Always respond in Arabic
  - `"en"`: Always respond in English

### Restaurant-Related Detection

AI checks if message is on-topic before responding:

1. If RAG context has relevant info → on-topic
2. Otherwise, check for keywords:
   - English: menu, order, price, delivery, etc.
   - Arabic: القائمة, طلب, سعر, توصيل, etc.

If off-topic → send `ai_agent.off_topic_response`

---

## Security

### Request Validation

✓ Twilio signature verification (HMAC-SHA1)
✓ Service role key restricted to server-side only
✓ API keys in environment variables only
✓ Database RLS policies (enforce restaurant ownership)

### Best Practices

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client
- Validate all Twilio webhook signatures
- Log errors without exposing sensitive data
- Use database row-level security (RLS) policies
- Rate-limit API endpoints (optional)

---

## Error Handling

### Webhook Errors

All errors return TwiML with user-friendly message:
```xml
<Response>
  <Message>عذراً، حدث خطأ. يرجى المحاولة لاحقاً.</Message>
</Response>
```

### Specific Cases

| Error | Handling | Status |
|-------|----------|--------|
| Missing restaurant | Log error, return 404 | 404 |
| AI generation fails | Send fallback message | 200 |
| Twilio send fails | Log error, TwiML returned | 200 |
| Invalid signature | Log warning, still process | 200 |
| Database error | Log error, fallback message | 200 |

### Logging

All errors logged to console:
```
[ERROR] Restaurant not found for phone: +966542228723
[ERROR] Gemini API error: message_not_found
[WARN] Invalid Twilio signature
```

---

## Performance

### Response Time Target

- **Webhook response**: < 15 seconds (Twilio timeout)
- **Menu crawl**: < 30 seconds per URL
- **AI generation**: < 5 seconds (Gemini API)

### Optimization

- RAG context limited to 5-10 items (top similar)
- Conversation history limited to 10 messages
- Menu items retrieved with pagination
- Twilio signature validation is optional (still processes if invalid)

---

## Testing

### Test Webhook

```bash
curl -X POST http://localhost:3000/api/webhooks/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM123&From=whatsapp:+966512345678&To=whatsapp:+966542228723&Body=مرحبا"
```

### Test Menu Crawl

```bash
curl -X POST http://localhost:3000/api/menu/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_id": "550e8400-e29b-41d4-a716-446655440000",
    "url": "https://www.ubereats.com/store/restaurant"
  }'
```

### Local Development

```bash
npm run dev  # Starts on http://localhost:3000
```

Then use Twilio CLI to forward webhooks:
```bash
twilio phone-numbers:update +966542228723 \
  --sms-url http://localhost:3000/api/webhooks/twilio
```

---

## Deployment Checklist

- [ ] SUPABASE_SERVICE_ROLE_KEY added to production .env
- [ ] GOOGLE_GEMINI_API_KEY added to production .env
- [ ] Twilio webhook URLs configured (main + status)
- [ ] Database tables created with RLS policies
- [ ] AI agent configured for each restaurant
- [ ] Knowledge base populated (menu crawler)
- [ ] Rate limiting configured (optional)
- [ ] Error monitoring setup (Sentry, etc.)
- [ ] Logs collection configured (CloudWatch, etc.)

---

## Support

For issues:
1. Check logs: `npm run dev` console output
2. Verify environment variables
3. Check Twilio webhook configuration
4. Test with sample requests
5. Review database tables for data

Created: 2026-04-02
Last Updated: 2026-04-02
