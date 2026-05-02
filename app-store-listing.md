# Nehgz Bot — App Store Listing Draft

App ID: 6762078573
Bundle ID: com.nehgz.nehgzbot
Version: 1.0.0 (Build 1)
Primary language on App Store Connect: English (U.S.)

---

## App Name (already set)

`Nehgz Bot` (30 char max — 9 used)

## Subtitle (30 chars max)

`AI Inbox for WhatsApp Business`  *(30 chars exactly)*

Alternates if you want a tweak:
- `WhatsApp AI for your business`
- `Your WhatsApp sales assistant`

## Promotional Text (170 chars max — appears at top, can change without resubmitting)

`Turn your WhatsApp number into a 24/7 AI assistant. Reply to customers in Arabic or English, capture bookings, and escalate to your team when needed.`

## Description (4,000 chars max)

```
Nehgz Bot is the merchant console for the Nehgz platform — a B2B service that turns your business WhatsApp number into a 24/7 AI sales and customer support assistant.

Built for restaurants, salons, clinics, booking businesses, and any merchant who wants their WhatsApp to actually close customers, not just collect them.

KEY FEATURES

• AI assistant trained on your business — your menu, services, hours, prices, and policies. Replies in Arabic or English, day or night.

• Unified inbox — every WhatsApp conversation in one place, with team assignments, unread tracking, and a clean Arabic-first UI.

• Smart escalation — the bot knows when to hand a conversation to a human, and pings the right team member with a push notification.

• Bookings and reservations — when the bot closes a booking, it appears in your orders dashboard automatically, ready for the kitchen, the hostess, or the technician.

• Marketing campaigns — send pre-approved WhatsApp template messages to customer segments without leaving the app.

• Team management — schedule shifts, assign roles (admin or agent), and track who is available to handle escalations.

• Customer profiles — see every conversation a customer has ever had with your business so context never gets lost.

• Knowledge base — upload your menus, FAQs, brochures, and policies for the AI to learn from.

• Attachments — send photos and documents from your library straight into customer chats.

• Push notifications — for every escalation, every new booking, and every template approval.

PRIVACY

Your data stays yours. Conversations are isolated per merchant, encrypted in transit, and never used to train shared AI models.

NOTE — REQUIRES AN ACCOUNT

This app is the merchant console for the Nehgz Bot service. To use it you must already have a Nehgz account and a connected WhatsApp Business number. Sign up at nehgz.com.
```

*(Length ≈ 1,820 chars — well under the 4,000 limit.)*

## Keywords (100 chars max — comma-separated, no spaces after commas)

`whatsapp,business,ai,chatbot,inbox,nehgz,booking,reservation,crm,customer,support,arabic,saudi`

*(94 chars, 13 keywords — within limit.)*

## Support URL

`https://nehgz.com`

If you have a real support/contact page, use that instead — Apple sometimes pings this URL during review.

## Marketing URL (optional)

`https://nehgz.com`

## Copyright

`2026 Nehgz`

(Use whatever legal entity owns the Apple Developer account — if it's a registered company name, put that.)

---

## App Review Information

### Sign-In Required: ✅ ON

### Demo account
- **Username:** `hamad@nehgz.com`
- **Password:** `hamad88`

### Contact Information
- **First name:** Hamad *(or Saad — whoever should answer if Apple has questions)*
- **Last name:** —
- **Phone:** *(your phone with country code)*
- **Email:** `hamad@nehgz.com` *(or your direct email)*

### Notes (paste this into the Notes box)

```
Hello App Review team,

Nehgz Bot is the merchant-facing console for the Nehgz platform, a B2B SaaS that lets restaurants, salons, clinics and similar businesses connect their WhatsApp Business number to an AI assistant. The AI handles customer messages, takes bookings, and escalates to a human team member when needed.

HOW TO TEST

1. Launch the app and sign in with the demo credentials provided above.
2. You will land on the dashboard for "Nehgz Hub", a real merchant tenant on our platform.
3. Tap the Inbox tab to see WhatsApp conversations. Open any conversation to see message history. You can send a text message, attach an image from the photo library, or hand the conversation off to a team member.
4. The Campaigns tab shows marketing template messages.
5. The Team tab shows team members and their availability.
6. The Profile tab has account settings and sign-out.

WHY EACH PERMISSION IS REQUESTED

• Photo Library — only triggered when the user taps the attachment icon inside a chat or while creating a marketing campaign. The app uses the photo to send it as a WhatsApp message attachment. We do not access photos at any other time.

• Push notifications — used to alert the merchant when a customer escalates to a human, or when a new booking is made.

The app does not request camera, microphone, location, contacts, or tracking permissions.

PURCHASES AND SUBSCRIPTIONS

There are no in-app purchases. The Nehgz subscription is sold to businesses on our website at nehgz.com, in line with Apple's guidelines for B2B services. The iOS app is the operational console for an already-purchased account.

ENCRYPTION

The app uses only standard HTTPS and the iOS Keychain via expo-secure-store. No proprietary encryption is included. ITSAppUsesNonExemptEncryption is set to false.

LANGUAGES

The app's UI defaults to Arabic. All test data in the demo account is also readable in Arabic. If you need an English-only walkthrough please email us and we will record one.

DEMO WHATSAPP NUMBER

The demo merchant is connected to a sandboxed WhatsApp number (+966542228723). No real customer messages will be received during your review window unless someone independently messages that number.

If you have any questions, please reach us at hamad@nehgz.com.

Thank you,
The Nehgz team
```

### Attachment (optional)

If Apple has rejected an earlier submission, attach a screen recording (mp4) showing the demo flow. For a first submission, leave empty.

---

## App Privacy (separate page, but required before submission)

You will need to fill out a survey at:
`App Information → App Privacy → Get Started`

Expected answers based on the audit:

| Data type | Collected? | Linked to user? | Used for tracking? |
|---|---|---|---|
| Email Address | Yes | Yes | No |
| Name | Yes | Yes | No |
| Phone Number | Yes | Yes | No |
| Photos (uploaded as message attachments) | Yes | Yes | No |
| Customer Support content | Yes | Yes | No |
| Diagnostics (crash logs from Expo) | Yes | No | No |

Do NOT mark anything as "used for tracking" — the app has no advertising / cross-app tracking SDKs.

## Age Rating

`4+` is appropriate. No mature content, no gambling, no medical/health, no unrestricted web access (only your own backend), no user-generated content shared publicly (conversations are 1:1 between merchant and their customers).

---

## What I still need from you before submitting

1. **A successful EAS production build for v1.0.0 build 1**, uploaded to App Store Connect via `eas submit`. This is the blocker — without a build the Submit button stays disabled.

2. **Screenshots** — minimum 1 set for 6.5" iPhone. Recommended:
   - Login screen
   - Inbox (list of conversations)
   - Open conversation with messages
   - Campaigns or Team screen
   - Profile screen
   Capture at 1242×2688 (iPhone 11 Pro Max) or 1290×2796 (iPhone 14 Pro Max). Drop them in `/Documents/projects/whatsapp-cs/mobile/screenshots/` and I'll upload them.

3. **App icon at 1024×1024** — App Store Connect needs this separately from the in-app icon. Should already be in place but confirm at App Information → App Store Information.

4. **Confirm the support URL** is `https://nehgz.com` or give me a different URL.

5. **Confirm the copyright string** — `2026 Nehgz` or your registered legal entity name.

Once those five are in place I'll fill every section in App Store Connect from this file, double-check every required toggle, and click Submit for Review.
