# Data Safety form — proposed answers

The Data Safety section is the form Play scrutinizes most. Be **truthful and over-declare** rather than under-declare; the cost of a mistake is a takedown, not a delay.

This draft is based on what I see in `/mobile` and `/supabase`:
- Auth via Supabase (email/password or magic link → JWT in SecureStore).
- `expo-image-picker` lets agents attach photos to WhatsApp replies.
- `expo-notifications` registers an Expo push token, which is stored server-side.
- Conversation content (messages between the restaurant and its customers) is read and written from the device.
- Backend reads/writes the data to Supabase Postgres + Storage, served from `nehgzbot.com` (Next.js on Vercel).

If any of the assumptions below are wrong (for example: you also collect the agent's location, or you use a third-party analytics SDK like Sentry/PostHog), tell me and I'll update.

---

## Section 1 — Data collection and security (top of form)

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** *(HTTPS to Supabase + Vercel; Expo push)* |
| Do you provide a way for users to request that their data is deleted? | **Yes** *(in-app: Profile → Delete account; web form: `https://nehgzbot.com/delete-account`; email: `privacy@nehgzbot.com`)* |

> ⚠ Play now requires **in-app account deletion** *or* a clearly linked web form for any app with user accounts. If you don't have one yet, the easiest fix is a profile screen button that calls a `/api/account/delete` endpoint, plus a public web form at e.g. `https://nehgzbot.com/delete-account` that Play can crawl. Add this **before** going to production — it's the #1 reason listings get rejected at this step.

---

## Section 2 — Data types collected

For each data type Play asks: **collected? / shared with third parties? / processing optional? / why collected? (functionality, account, analytics, fraud, dev comms, advertising, personalization)**.

### Personal info

| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Name | Yes (manager's display name on profile) | No | No | Account management, App functionality |
| Email address | Yes (sign-up + auth) | No | No | Account management |
| User IDs | Yes (Supabase user UUID, restaurant_id) | No | No | Account management, App functionality |
| Phone number | **Yes** — your privacy policy declares the manager's phone number is collected at signup (`section 2.1`). | No | No | Account management |
| Address, race/ethnicity, political/religious/sexual orientation | No | – | – | – |

### Financial info
None collected. The app does not handle payments. Mark all as **not collected**.

### Health & fitness
Not collected.

### Messages

| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Emails | No | – | – | – |
| SMS or MMS | No | – | – | – |
| Other in-app messages | **Yes** — WhatsApp messages between the restaurant and its customers flow through the app. | **Yes — shared with Google (Gemini)** for AI reply generation, per §4 of the privacy policy. | No | App functionality |

> ⚠ Important: because §4 of `src/app/(public)/privacy/page.tsx` states that message context is sent to Google Gemini, you **must** mark "Other in-app messages" as **shared**. Sharing means the data leaves your servers to a third party for processing. Marking it as not-shared while the policy says otherwise is the single most common reason Play pulls apps post-launch. In the same row, make sure to add **Google Cloud (Vertex AI / Gemini)** to the data-recipient list when Play asks who you share with.

### Photos and videos

| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Photos | Yes (agent picks photos to attach to WhatsApp replies) | No | **Yes** *(only when the agent uses the attach button)* | App functionality |
| Videos | No | – | – | – |

### Audio files
Not collected. Your `expo-image-picker` config explicitly disables `microphonePermission`.

### Files and docs

| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Files and docs | **Conditional** — yes if the agent ever attaches a non-image document via `expo-document-picker`. The dependency is in `package.json`, so probably yes. | No | Yes | App functionality |

### Calendar
Not collected.

### Contacts
Not collected. You use a server-side customer directory keyed off WhatsApp numbers; you don't read the device's address book.

### App activity

| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| App interactions | No (declare yes only if you wire up an analytics SDK) | – | – | – |
| In-app search history | No | – | – | – |
| Installed apps | No | – | – | – |
| Other user-generated content | Yes (labels, notes, campaign copy authored by the manager) | No | No | App functionality |
| Other actions | No | – | – | – |

### Web browsing
Not collected.

### App info and performance

| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Crash logs | **Yes** — privacy policy §2.3 says you collect error reports. | No | No | App functionality, Analytics |
| Diagnostics | **Yes** — privacy policy §2.1 mentions "session and diagnostic data" and §2.3 mentions device type, IP, timestamps. | No | No | App functionality, Analytics |
| Other app performance data | No | – | – | – |

### Device or other IDs

| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Device or other IDs | **Yes** — Expo push token is a device-bound identifier. | No | No | App functionality (push notifications for approvals/escalations) |

### Location

| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Approximate location | No | – | – | – |
| Precise location | No | – | – | – |

---

## Section 3 — Security practices (must answer)

| Question | Answer | Notes |
|---|---|---|
| Is your data encrypted in transit? | **Yes** | All API traffic is HTTPS. |
| Do you provide a way for users to request data deletion? | **Yes** | See note above — must be wired up before submission. |
| Committed to follow Play's Families Policy? | **No** | Not a kids' app. |
| Independent security review? | **No** | Unless you have a SOC 2 or similar — leave No. |

---

## Section 4 — Final declaration text (paste in the "Privacy practices URL" field)

Use the same URL as your privacy policy: `https://nehgzbot.com/privacy`

---

## Cross-check — corrections already applied vs. open questions

Already aligned with the existing privacy page at `src/app/(public)/privacy/page.tsx`:
- Phone number → **collected** (per §2.1).
- Customer messages → **shared with Google Gemini** (per §4).
- Crash logs / diagnostics → **collected** (per §2.1, §2.3).

Still open — please confirm:
1. **In-app delete-account flow**: does Profile screen offer "Delete my account"? If not, we need to add it (or a public web form) before submission.
2. **Apple/Google Push** is named in the privacy policy — Expo Push delivers via FCM on Android. That's already covered by "Device or other IDs". No extra action.
3. The privacy page lists `privacy@nehgzbot.com` as the contact. The Data Safety form doesn't have a separate email field, but Play uses your store-listing email. Make sure both inboxes are monitored.
