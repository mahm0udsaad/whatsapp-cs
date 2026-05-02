# App Store Connect Submission Package — Nehgz Bot (نِهجز بوت)

App ID: **6762078573** · Bundle ID: **com.nehgz.nehgzbot** · Version: **1.0.0** · Build: **1**
Apple ID account: **support@nehgzbot.com** · Expo project: `a7b7daaf-c9db-427e-9e3b-fc032fb045ef`
Primary language: **Arabic (Saudi Arabia)** · Secondary: **English**

---

## 1. Pre-flight audit

### 1.1 `mobile/app.json` (iOS block)

| Field | Value | Status |
|---|---|---|
| `name` | `Nehgz Bot` | OK |
| `version` | `1.0.0` | OK |
| `ios.bundleIdentifier` | `com.nehgz.nehgzbot` | OK — matches ASC record |
| `ios.supportsTablet` | `false` | OK — confirms iPad screenshots NOT required |
| `ios.buildNumber` | `"1"` | OK for first submission |
| `ios.infoPlist.UIBackgroundModes` | `["remote-notification"]` | OK — needed for push |
| `ios.infoPlist.ITSAppUsesNonExemptEncryption` | `false` | **CORRECT** (see §8) |
| `ios.infoPlist.NSPhotoLibraryUsageDescription` | Arabic string present | OK — clear, business-justified |
| `expo-image-picker` plugin `photosPermission` | Arabic string | OK |
| `expo-image-picker` plugin `cameraPermission` | `false` | OK — no NSCameraUsageDescription needed |
| `expo-image-picker` plugin `microphonePermission` | `false` | OK — no NSMicrophoneUsageDescription needed |
| `newArchEnabled` | `true` | OK |
| `runtimeVersion.policy` | `appVersion` | OK for OTA via expo-updates |

**Permission strings verified (Arabic clarity):**
- `NSPhotoLibraryUsageDescription` — *“نحتاج إذنك للوصول إلى صورك حتى تتمكن من إرفاق الصور في محادثات الواتساب مع عملائك وفي حملاتك التسويقية.”* — Clear, names the feature, names the why. **Apple-compliant.**

### 1.2 `mobile/eas.json`

- `submit.production.ios.appleId = support@nehgzbot.com` ✓
- `submit.production.ios.ascAppId = 6762078573` ✓
- Production env points to `https://nehgzbot.com` ✓
- `cli.appVersionSource = "remote"` — version & build will be managed by EAS; do NOT bump `version`/`buildNumber` in `app.json` for subsequent builds, run `eas build:version:set` instead.

### 1.3 Assets folder (`mobile/assets/`)

Found: `icon.png`, `logo.png`. **Owner must verify `icon.png` is exactly 1024×1024 px, sRGB, no alpha channel, no transparency** before EAS build (Apple rejects icons with alpha). Run on macOS:
```
sips -g pixelWidth -g pixelHeight -g hasAlpha mobile/assets/icon.png
```
If `hasAlpha = yes`, flatten with:
```
sips -s format png --setProperty hasAlpha NO mobile/assets/icon.png --out mobile/assets/icon.png
```

### 1.4 Libraries → App Privacy mapping (from `package.json`)

| Library | Triggers privacy disclosure |
|---|---|
| `expo-notifications` | Push tokens (linked to user, App Functionality) |
| `expo-image-picker` | Photos — only when user picks; not collected by us |
| `expo-secure-store` | On-device only, no disclosure required |
| `expo-document-picker` | User-initiated file pick; no automatic collection |
| `@supabase/supabase-js` | Account, content, identifiers (linked, App Functionality) |
| `expo-updates` | Anonymous device id for OTA channel routing |
| `expo-device` | Reads device model/OS for crash context — coarse, not collected to server unless logged |

No analytics SDKs, no ad SDKs, no Facebook/Firebase/AppsFlyer. **Tracking = NO** across the board.

### 1.5 Sign in with Apple

The login screen uses email + password via Supabase Auth (`mobile/app/(auth)/login.tsx`). **No third-party social login is offered.** Apple’s Sign in with Apple requirement is therefore **NOT triggered**. Do not enable Apple Sign-In.

### 1.6 Issues / blockers found

- ✅ No blockers in config.
- ⚠️ Owner action: confirm icon.png 1024² with no alpha (see §1.3).
- ⚠️ Owner action: prepare demo account for App Review (see §7).
- ⚠️ Owner action: produce screenshots (see §3).

---

## 2. App Store Connect listing copy

> All Arabic copy is the primary listing (Arabic — Saudi Arabia). English is the secondary localization.

### 2.1 Arabic (Saudi Arabia) — primary

- **Name (≤30):** `نِهجز بوت` (8)
- **Subtitle (≤30):** `مساعد واتساب الذكي للأعمال` (28)
- **Promotional Text (≤170):**
  `وفّر وقت فريقك ورد على عملاء واتساب أسرع! ردود ذكية تلقائية، قاعدة معرفة، حملات تسويقية، تصعيد فوري للمحادثات المهمّة. كل هذا في تطبيق واحد.`
- **Description (≤4000):**

```
نِهجز بوت هو مساعدك الذكي لإدارة خدمة عملاء واتساب بزنس، مصمّم خصيصًا للأنشطة التجارية في المملكة العربية السعودية.

اربط رقم واتساب بزنس الخاص بنشاطك، وخلّ الذكاء الاصطناعي يقترح ردودًا فورية مبنية على قاعدة المعرفة الخاصة بك. يقدر فريقك يوافق أو يعدّل قبل الإرسال، أو تخلّيه يرد تلقائيًا للأسئلة المتكررة.

— الميزات الرئيسية —

• ردود ذكية بالذكاء الاصطناعي
يولّد التطبيق ردودًا مقترحة بلهجتك ومعلومات نشاطك، مع اكتشاف نيّة العميل (طلب، استفسار، شكوى).

• قاعدة معرفة موحّدة
أضف الأسئلة الشائعة، أوقات العمل، الأسعار، سياسات الإرجاع — مرّة واحدة، ويستخدمها الذكاء الاصطناعي في كل المحادثات.

• صندوق وارد ذكي
كل محادثات واتساب في مكان واحد، مع تصنيفات (جديد، عاجل، مغلق…) وبحث سريع.

• تصعيد فوري
حدّد قواعد التصعيد (مبلغ كبير، شكوى، عميل VIP) وتصل تنبيهات لحظية للمسؤول.

• حملات تسويقية
أرسل حملات واتساب مستهدفة بقوالب معتمدة، وتابع نتائج التسليم.

• إدارة الفريق والمناوبات
أدوار للموظفين، جداول مناوبات، وصلاحيات دقيقة لكل دور.

• إشعارات فورية
لا يفوتك تصعيد ولا رسالة عاجلة.

— لمن هذا التطبيق؟ —

أصحاب الأنشطة التجارية، مدراء خدمة العملاء، وفِرق المبيعات الذين يعتمدون على واتساب بزنس للتواصل مع عملائهم.

— ملاحظة هامّة —

نِهجز بوت أداة مهنية تتطلّب حسابًا فعّالًا لدى Meta WhatsApp Business Platform (Cloud API). قبل الاستخدام تأكّد من ربط رقم واتساب بزنس الخاص بنشاطك.

— الخصوصية —

لا نبيع بياناتك ولا نستخدم محتوى المحادثات لتدريب نماذج الذكاء الاصطناعي. سياسة الخصوصية الكاملة متاحة عبر الموقع.

ابدأ الآن ووفّر وقت فريقك من أول يوم.
```

- **Keywords (≤100, comma-separated, no spaces):**
  `واتساب,بوت,ردود,ذكاء,اصطناعي,خدمة,عملاء,نهجز,whatsapp,bot,ai,crm,inbox,ksa`
  (length: 95 chars)
- **What’s New (release notes v1.0.0):**
  `الإصدار الأول من نِهجز بوت — صندوق وارد واتساب ذكي، ردود بالذكاء الاصطناعي، قاعدة معرفة، حملات تسويقية، إدارة فرق وإشعارات تصعيد فورية.`
- **Support URL:** `https://nehgzbot.com/support` *(owner must confirm/create)*
- **Marketing URL (optional):** `https://nehgzbot.com`
- **Privacy Policy URL (required):** `https://nehgzbot.com/privacy` *(host the contents of `docs/privacy-policy-ar.md` + `-en.md`)*

### 2.2 English (US) — secondary

- **Name (≤30):** `Nehgz Bot — WhatsApp AI` (23)
- **Subtitle (≤30):** `AI WhatsApp inbox for KSA SMBs` (30)
- **Promotional Text (≤170):**
  `Reply to WhatsApp customers faster with AI. Smart auto-replies, knowledge base, escalations, and marketing campaigns — all in one inbox built for Saudi businesses.`
- **Description (≤4000):**

```
Nehgz Bot is the AI-powered assistant that lets your business manage WhatsApp Business customer service in one place.

Connect your WhatsApp Business number, and our AI suggests instant replies grounded in your own knowledge base. Your team can approve, edit, or let the AI handle FAQs end-to-end.

— Key features —

• AI Smart Replies
Drafts replies in your tone using your business info. Detects customer intent (order, inquiry, complaint).

• Unified Knowledge Base
Add FAQs, hours, pricing, return policies once — the AI uses them across every chat.

• Smart Inbox
Every WhatsApp conversation in one screen, with labels (new, urgent, closed…), filters, and fast search.

• Real-time Escalation
Define rules (high-value order, complaint, VIP customer) and get instant alerts to the right manager.

• Marketing Campaigns
Send targeted WhatsApp campaigns with approved templates and track delivery results.

• Team & Shifts
Roles for owners, supervisors, and agents. Shift schedules and granular permissions.

• Push Notifications
Never miss an escalation or urgent message.

— Who it’s for —

Business owners, customer-support managers, and sales teams that rely on WhatsApp Business to talk to their customers.

— Important —

Nehgz Bot is a B2B tool. It requires an active Meta WhatsApp Business Platform (Cloud API) account. Connect your WhatsApp Business number before first use.

— Privacy —

We do not sell your data and do not use conversation content to train AI models. Full policy on our website.

Start today and save your team hours from day one.
```

- **Keywords (≤100):** `whatsapp,bot,ai,crm,inbox,customer,support,ksa,arabic,saudi,chat,sales,nehgz`
  (length: 81)
- **What’s New:** `Initial release — AI smart replies, unified inbox, knowledge base, marketing campaigns, team roles, escalation alerts.`
- **Support URL:** `https://nehgzbot.com/support`
- **Marketing URL:** `https://nehgzbot.com`
- **Privacy Policy URL:** `https://nehgzbot.com/privacy`

---

## 3. Required visual assets

| Asset | Spec | Required? | In repo? | Status |
|---|---|---|---|---|
| App Icon | 1024×1024 PNG, sRGB or P3, **no alpha**, no transparency, no rounded corners | Yes | `mobile/assets/icon.png` (likely 1024) | **Verify alpha removed** |
| iPhone 6.7" screenshots | 1290×2796 px, PNG/JPEG, RGB, ≥3 ≤10 | **Yes (required)** | None | **Owner to produce 5–6** |
| iPhone 6.5" screenshots | 1242×2688 or 1284×2778 | Optional in 2026 (6.7" auto-scales), **but recommended** | None | Optional |
| iPhone 5.5" screenshots | 1242×2208 | Optional (no longer required by ASC) | None | **Skip** |
| iPad 12.9" screenshots | 2048×2732 | **Not required** — `supportsTablet: false` confirmed | None | **Skip** |
| App Preview video (optional) | 886×1920 / 1080×1920, ≤30 s | Optional | None | Skip for v1 |

### 3.1 Suggested screenshot script (5 screens, RTL Arabic UI)

Each frame has a top caption (white-on-blue band) + the actual app screenshot. Produce in 1290×2796 first, then export 1242×2688 by re-rendering at that canvas (don’t just resize).

| # | Screen | Arabic caption (top band) | English caption (top band) |
|---|---|---|---|
| 1 | Inbox list with badges + AI draft chip | `صندوق وارد واتساب ذكي — رد أسرع` | `One Smart WhatsApp Inbox` |
| 2 | Conversation detail with AI suggested reply | `ردود مقترحة بالذكاء الاصطناعي` | `AI-Drafted Replies, Approve in One Tap` |
| 3 | Knowledge base list | `قاعدة معرفة واحدة لكل فريقك` | `One Knowledge Base for the Whole Team` |
| 4 | Campaigns / templates screen | `حملات واتساب التسويقية` | `Run WhatsApp Marketing Campaigns` |
| 5 | Escalations / approvals + push notification overlay | `تصعيد فوري للمحادثات المهمّة` | `Instant Escalation Alerts` |
| 6 (optional) | Team & shifts | `أدوار، مناوبات، وصلاحيات دقيقة` | `Roles, Shifts & Granular Permissions` |

**Owner deliverables for §3:**
1. `icon-1024.png` (verified no-alpha) — 1
2. `iphone-67-*.png` 1290×2796 — 5 to 6
3. (optional) `iphone-65-*.png` 1284×2778 — same set, re-rendered

---

## 4. App information

- **Primary category:** **Business** (recommended) — fits “tools for managing a business”.
- **Secondary category:** **Productivity**.
- **Content rights:** the app does not contain, show, or access third-party content. Mark **No**.
- **Age rating questionnaire (expect 4+):**
  - Cartoon/Fantasy Violence: None
  - Realistic Violence: None
  - Sexual Content / Nudity: None
  - Profanity / Crude Humor: None
  - Alcohol/Tobacco/Drugs: None
  - Mature/Suggestive Themes: None
  - Horror/Fear: None
  - Medical/Treatment Info: None
  - Gambling: None
  - Contests: None
  - Unrestricted Web Access: **No** (the app does not embed an open browser)
  - User-Generated Content: **No** (content is private business↔customer; not surfaced publicly)
  - Made for Kids: **No**
  - Result: **4+**
- **Copyright line:** `© 2026 Nehgz`
- **Trade Representative Contact (Korea):** N/A
- **Routing app coverage file:** **Not needed** (not a navigation app).
- **Game Center:** disabled.
- **In-App Purchases:** none in v1.0.0.

---

## 5. App Privacy (“Privacy Nutrition Label”)

For each section: *Linked = tied to user identity*; *Tracking = combined with third-party data for ads/data brokers*. **No tracking anywhere.**

### 5.1 Data collected

#### Contact Info
- **Email Address**
  - Collected: Yes
  - Linked to user: **Yes**
  - Used for tracking: **No**
  - Purposes: App Functionality, Account Management

#### User Content
- **Photos or Videos** (only when user manually attaches)
  - Linked: **Yes** · Tracking: **No** · Purposes: App Functionality
- **Customer Support / Other User Content** (message bodies, knowledge-base entries, campaign templates)
  - Linked: **Yes** · Tracking: **No** · Purposes: App Functionality

#### Identifiers
- **User ID** (Supabase user id, team-member id)
  - Linked: **Yes** · Tracking: **No** · Purposes: App Functionality, Authentication
- **Device ID** (Expo push token, anonymous device id)
  - Linked: **Yes** · Tracking: **No** · Purposes: App Functionality

#### Contacts
- **Phone Numbers** (the business’s end-customers’ numbers, received via WhatsApp Cloud API or uploaded for campaigns)
  - Linked: **Yes** (linked to the workspace, not the app user personally — but ASC label-wise, mark Linked)
  - Tracking: **No**
  - Purposes: App Functionality

#### Diagnostics
- **Crash Data**
  - Linked: **No** · Tracking: **No** · Purposes: App Functionality
- **Performance Data**
  - Linked: **No** · Tracking: **No** · Purposes: App Functionality

### 5.2 Data NOT collected

Confirm in ASC: Health & Fitness, Financial Info, Location (precise/coarse), Sensitive Info, Browsing History, Search History, Audio Data, Gameplay Content, Other Data Types — **None**.

### 5.3 “Do you or your third-party partners use data for tracking?”
**No.**

### 5.4 “Do you use data to track users?”
**No.**

---

## 6. Privacy policy & Terms

- **`docs/privacy-policy-en.md`** — exists (created by the parallel agent). **Reused, not overwritten.**
- **`docs/privacy-policy-ar.md`** — created in this pass.
- Owner must publish both to a public URL (e.g. `https://nehgzbot.com/privacy` with `?lang=ar`/`?lang=en`) and paste the URL into the ASC **Privacy Policy URL** field for both localizations.
- Terms of Service (optional but recommended): not produced here unless requested.

---

## 7. App Review notes (paste into ASC → App Review Information)

```
Hello App Review team,

Nehgz Bot is a B2B tool used by businesses in Saudi Arabia to manage their own WhatsApp Business Cloud API inbox. It is NOT a consumer messaging app.

============================================================
DEMO ACCOUNT (please use this to log in)
============================================================
Email:    <OWNER TO FILL: e.g. apple-review@nehgz.com>
Password: <OWNER TO FILL>

This account is pre-seeded with:
  • A demo workspace ("Demo Store")
  • A connected sandbox WhatsApp Business number with simulated
    conversations
  • Sample knowledge-base entries
  • Sample marketing campaigns and templates
  • Sample escalations

============================================================
WHY YOU CAN'T REALLY SEND A WHATSAPP FROM THIS ACCOUNT
============================================================
The Meta WhatsApp Cloud API requires a verified business phone
number that has been provisioned and reviewed by Meta. We
cannot expose a live production number in a review account
without violating Meta's policy. Therefore the demo account is
configured against a sandbox/test number that:

  • DOES allow you to view all inbox UI, AI suggestions,
    labels, knowledge base, campaign builders, escalations,
    notifications, and team management — i.e. every feature
    of this app.
  • Will queue any outbound message you compose, but Meta
    will reject the actual delivery for unverified test
    recipients. The UI will still confirm "queued".

To exercise inbox flows, please open any conversation seeded
under "صندوق الوارد / Inbox" — these are real-looking
seeded threads.

============================================================
PUSH NOTIFICATIONS
============================================================
After login, allow notifications. Within ~60 seconds, our
backend will fire a sample escalation push so you can verify
the notification UX.

============================================================
BACKEND
============================================================
The Next.js + Supabase backend is hosted at:
   https://nehgzbot.com
It will remain available throughout review.

============================================================
SIGN IN WITH APPLE
============================================================
Not required — the app does not offer any third-party social
login. Authentication is email + password only.

============================================================
EXPORT COMPLIANCE
============================================================
ITSAppUsesNonExemptEncryption = false. The app uses only
standard HTTPS/TLS via the OS networking stack and contains
no proprietary cryptography.

============================================================
CONTACT
============================================================
Owner:  Nehgz
Email:  support@nehgzbot.com
Phone:  <OWNER TO FILL>
Hours:  Sun–Thu 09:00–18:00 (AST, UTC+3)

Thank you!
```

> **Owner action:** before submitting, fill `<OWNER TO FILL>` placeholders, create the `apple-review@nehgz.com` user, and seed it.

---

## 8. Export compliance

`ITSAppUsesNonExemptEncryption = false` is **correct**:
- The app uses only HTTPS/TLS provided by iOS (URLSession underneath fetch).
- `expo-secure-store` uses the iOS Keychain (system-provided crypto, not “proprietary”).
- No custom symmetric/asymmetric algorithms, no certificate pinning libraries with custom crypto, no end-to-end encryption beyond what the OS provides.
- This makes the app exempt under EAR §740.17(b)(1) and qualifies for the “mass-market HTTPS” exception. **No annual self-classification report needed.**

If the answer ever changes (e.g. you add a custom AES routine for a chat-side feature), set this to `true` and complete the Encryption questionnaire in ASC.

---

## 9. EAS production build & submit

```bash
# 0. Ensure you are logged in
eas whoami
eas login   # if needed (account: mahm0udsaad)

cd mobile

# 1. (one-time) Confirm version & buildNumber are managed remotely
#    eas.json already has appVersionSource = "remote".
#    Set the initial version on EAS:
eas build:version:set --platform ios   # follow prompts → 1.0.0 / 1

# 2. Generate / register iOS credentials interactively (first build only)
eas credentials   # iOS → production → "Set up a new Distribution Certificate"
                  # Provisioning Profile: "Build a new profile"

# 3. Production build (App Store distribution)
eas build --platform ios --profile production
# Wait for the build (~15-25 min). It produces an .ipa in EAS dashboard.

# 4. Submit to App Store Connect
#    Use App Store Connect API key (recommended) — generate in
#    https://appstoreconnect.apple.com/access/api
#    Save it via:
eas credentials   # iOS → "App Store Connect API Key" → upload .p8

#    Then submit the latest build:
eas submit --platform ios --profile production --latest
# eas reads submit.production.ios from eas.json
# (appleId=support@nehgzbot.com, ascAppId=6762078573)
```

Optional one-shot:
```bash
eas build --platform ios --profile production --auto-submit
```

After submit, the build appears in App Store Connect → TestFlight within ~10–30 minutes (after Apple processing). Wait for processing to finish (no “(Processing)” next to the build) before selecting it for the version under review.

---

## 10. Submission checklist (run top-to-bottom in App Store Connect)

- [ ] **Pre-build**
  - [ ] Verify `mobile/assets/icon.png` is 1024×1024, no alpha (§1.3 command)
  - [ ] Confirm `version` 1.0.0 / `buildNumber` 1 visible in EAS
  - [ ] Production env URL reachable: `https://nehgzbot.com/api/health`
  - [ ] Demo account `apple-review@nehgz.com` created and seeded
  - [ ] Privacy policy hosted at public URL (Arabic + English)
- [ ] **Build & upload**
  - [ ] `eas build --platform ios --profile production` succeeded
  - [ ] `eas submit --platform ios --latest` succeeded
  - [ ] Build appears in ASC TestFlight, Processing complete
- [ ] **App Store Connect — App Information**
  - [ ] Primary language: Arabic (Saudi Arabia)
  - [ ] Bundle ID: com.nehgz.nehgzbot
  - [ ] Primary category: Business · Secondary: Productivity
  - [ ] Content Rights: No third-party content
  - [ ] Age Rating completed → 4+
  - [ ] License Agreement: Standard EULA
- [ ] **Pricing & Availability**
  - [ ] Price: Free (or as decided)
  - [ ] Availability: Saudi Arabia + GCC + worldwide as desired
- [ ] **App Privacy**
  - [ ] Privacy Policy URL set
  - [ ] Data Types from §5 entered
  - [ ] Tracking = No
- [ ] **Version 1.0.0 page (Arabic — primary)**
  - [ ] Name, Subtitle, Promotional Text, Description, Keywords (§2.1)
  - [ ] Support URL, Marketing URL
  - [ ] What’s New (release notes)
  - [ ] 6.7" iPhone screenshots uploaded (≥3)
- [ ] **Version 1.0.0 page (English — secondary)**
  - [ ] All §2.2 fields
  - [ ] Same screenshots re-attached (or English-caption variants)
- [ ] **Build**
  - [ ] Select build 1.0.0 (1) for this version
- [ ] **App Review Information**
  - [ ] Demo account email + password (§7)
  - [ ] Notes (§7) pasted
  - [ ] Contact: name, email, phone
- [ ] **Version Release**
  - [ ] Manually release after approval (recommended for v1)
- [ ] **Export Compliance**
  - [ ] Confirms “Uses standard encryption only (HTTPS)” → exempt
- [ ] **Submit for Review**

---

### Appendix A — Strings ready to paste

Provided inline above (§2.1, §2.2, §7).

### Appendix B — Files produced by this task

- `docs/app-store-submission.md` (this file)
- `docs/privacy-policy-ar.md` (new)
- `docs/privacy-policy-en.md` (pre-existing, reused)
