# Privacy Policy — Nehgz Bot

**Effective date:** 27 April 2026
**Controller:** Nehgz (operator of the Nehgz Bot mobile app and backend)
**Contact:** privacy@nehgzbot.com

This Privacy Policy describes how Nehgz ("we", "us") collects, uses, stores, and shares information when you ("the business owner / agent") use the **Nehgz Bot** mobile application (the "App") and the backend services it connects to.

The App is a B2B tool that allows businesses in the Kingdom of Saudi Arabia to manage their WhatsApp Business customer-service conversations, including AI-assisted replies, knowledge base management, conversation labeling and escalation, and outbound marketing campaigns.

Nehgz Bot is **not** a consumer messaging app. It does not host messaging between end consumers; it is used by businesses to manage their own WhatsApp Business inbox.

---

## 1. Information we collect

### 1.1 Account information (from you, the business owner / agent)
- Full name
- Email address
- Hashed password (or OAuth identifier if you sign in via a third party)
- Role inside the business (owner, agent, supervisor)
- Workspace / business name and logo

### 1.2 WhatsApp Business connection data
- Your Meta WhatsApp Business Account ID (WABA ID)
- Phone number ID and display number
- API access token (stored encrypted)
- Webhook verification token

### 1.3 Conversation data (your customers' messages, processed on your behalf)
When you connect your WhatsApp Business number, the App receives, stores, and displays:
- The phone numbers of customers who contact your business
- Customer-provided names (as supplied by WhatsApp)
- Message text, media attachments, and timestamps
- AI-generated draft replies and final agent replies
- Conversation labels, status (open / escalated / resolved), and notes

You act as the data controller for this conversation data. Nehgz acts as your data processor.

### 1.4 Knowledge base content
- FAQ entries, product/service info, business hours, and any other content you upload to power the AI replies.

### 1.5 Marketing campaign data
- Recipient phone-number lists you upload
- Template content
- Send status and delivery results returned by Meta

### 1.6 Device & technical data
- Push notification token (Expo Push token) tied to your installation
- Device model and OS version (for crash diagnostics)
- App version
- IP address and approximate region (server logs)
- Crash and error logs

### 1.7 Photos / files
The App requests **photo library** access only when you choose to attach an image to a message or campaign. We do not scan or upload photos in the background.

---

## 2. How we use the information

- To authenticate you and keep your session secure (using `expo-secure-store` on-device).
- To deliver and display incoming WhatsApp messages and to send outgoing replies on your behalf via the Meta WhatsApp Cloud API.
- To generate AI draft replies using Google Gemini, based on your knowledge base and the active conversation.
- To run marketing campaigns you create, to your audience.
- To send you push notifications (e.g. an escalation needs your attention).
- To improve product reliability (aggregated, non-identifying analytics and crash reports).
- To comply with law and prevent abuse.

We do **not** sell personal data. We do **not** use customer phone numbers or message content to train AI models.

---

## 3. Third parties we share data with

The App is built on these sub-processors, each acting under a data-processing agreement:

| Sub-processor | Purpose | Data shared |
|---|---|---|
| **Supabase** (database & auth, EU/US regions) | Primary data store, authentication, file storage | Account info, conversations, knowledge base, campaign data |
| **Meta Platforms (WhatsApp Cloud API)** | Sending and receiving messages on your behalf | Your WABA credentials, message content, recipient phone numbers |
| **Google (Gemini API)** | AI draft generation | The active message thread + your knowledge base snippets, transient — not stored by Google for training under the paid API |
| **Expo / EAS** (push notifications, OTA updates) | Push delivery, app updates | Push token, app version |
| **Vercel** (backend hosting) | Hosting the Next.js backend | Standard request/response data |

We do not share your data with advertisers or data brokers.

---

## 4. Where data is stored

Conversation and account data is stored in our Supabase Postgres instance. Backups are encrypted at rest. Data in transit is encrypted via TLS 1.2+.

---

## 5. Retention

- Active account data is retained while your workspace is active.
- WhatsApp conversation history is retained while the workspace is active so you can search past conversations.
- When you delete your workspace, we hard-delete personal data within **30 days**, except where retention is required by law.
- Aggregated, non-identifying logs may be retained up to 12 months for security and abuse prevention.

---

## 6. Your rights

If you are in Saudi Arabia (PDPL) or another jurisdiction granting privacy rights (GDPR, etc.), you may:
- Access the personal data we hold about you
- Correct inaccurate data
- Delete your account and associated data
- Export your data in a machine-readable format
- Object to or restrict certain processing
- Withdraw consent

To exercise any of these rights, email **privacy@nehgzbot.com**. We will respond within 30 days. You may also delete your account from inside the App: Settings → Account → Delete account.

For the customers whose phone numbers and messages are received through your WhatsApp Business number: you (the business owner) are the controller. End-customer requests should be directed to you. We will support you in fulfilling them.

---

## 7. Children

The App is intended for business users 18+. It is not directed to children. We do not knowingly collect data from anyone under 18.

---

## 8. Security

- All API traffic uses HTTPS / TLS.
- Auth tokens on-device are stored in the OS keystore via `expo-secure-store`.
- Server-side secrets (WABA tokens, etc.) are encrypted at rest.
- Access to production data is restricted to authorized engineers under audit logging.

No system is perfectly secure. If we discover a breach affecting your data we will notify you without undue delay.

---

## 9. International transfers

Your data may be processed in the United States, European Union, or other countries where our sub-processors operate, under standard contractual clauses or equivalent safeguards.

---

## 10. Changes to this policy

We will post any material changes here and notify active workspaces by email at least 14 days before they take effect.

---

## 11. Contact

**Email:** privacy@nehgzbot.com
**Postal:** Nehgz, Riyadh, Kingdom of Saudi Arabia

---
