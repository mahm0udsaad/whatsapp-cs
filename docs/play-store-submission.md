# Google Play Console Submission Package — Nehgz Bot

**App ID (Play Console):** 4972699644480779922
**Package name:** `com.nehgz.nehgzbot`
**App display name:** Nehgz Bot · نِهجز بوت
**Owner / Expo account:** `mahm0udsaad`
**EAS project:** `a7b7daaf-c9db-427e-9e3b-fc032fb045ef`
**Backend:** `https://nehgzbot.com`
**Primary store language:** Arabic (Saudi Arabia) — `ar-SA`
**Secondary:** English (United States) — `en-US`
**Target SDK / target audience age:** Android 14 (SDK 34+) / 18+

> This document is the single source of truth for the first production release on Google Play. It is **copy-ready**: every section can be pasted directly into the Play Console field of the same name. The owner does **not** modify `mobile/app.json` or `mobile/eas.json` based on this doc — only what is explicitly called out as a recommendation in §1 below.

---

## 1. Pre-flight audit

### 1.1 What is in `mobile/app.json` today
| Field | Current value | Required for Play | Verdict |
|---|---|---|---|
| `expo.name` | `Nehgz Bot` | App name <= 30 chars | OK |
| `expo.version` | `1.0.0` | Required (versionName) | OK |
| `expo.android.package` | `com.nehgz.nehgzbot` | Must match Play listing | OK |
| `expo.android.adaptiveIcon.foregroundImage` | `./assets/icon.png` (1024x1024) | Adaptive icon foreground | **Adequate** but not optimal — see §1.4 |
| `expo.android.adaptiveIcon.backgroundColor` | `#1e3a8a` | Solid color background | OK |
| `expo.icon` | `./assets/icon.png` (1024x1024) | App icon source | OK |
| `expo.splash.image` | `./assets/logo.png` (1024x1024) | Splash | OK |
| `expo.splash.backgroundColor` | `#1e3a8a` | Splash bg | OK |
| `expo.android.versionCode` | **MISSING** | Required for AAB | **Action:** rely on EAS `appVersionSource: "remote"` (configured) — EAS auto-increments versionCode on each prod build. No app.json change needed. |
| `expo.android.permissions` | not listed (defaults from plugins) | Notifications, photos | OK — `expo-notifications`, `expo-image-picker`, `expo-secure-store` plugins inject required perms automatically |
| `runtimeVersion.policy` | `appVersion` | OTA | OK |
| `updates.url` | EAS Update URL set | OTA | OK |

### 1.2 `mobile/eas.json` audit
- `cli.appVersionSource: "remote"` — versionCode is managed in EAS dashboard. Confirmed.
- `build.production` profile exists with channel `production` and `EXPO_PUBLIC_APP_BASE_URL=https://nehgzbot.com`. Builds an AAB by default (production builds default to AAB on Android, since `buildType` is not overridden).
- `submit.production.android` — **MISSING**. Needs to be added before `eas submit --platform android` works without flags. See §7 for the recommended block to add.

### 1.3 Assets present in repo
| Asset | Path | Size | Status |
|---|---|---|---|
| App icon source | `mobile/assets/icon.png` | 1024×1024 PNG (RGB, no alpha) | OK |
| Splash logo | `mobile/assets/logo.png` | 1024×1024 PNG | OK |
| Adaptive icon foreground (store-assets) | `store-assets/android/adaptive-icon-foreground.png` | 1024×1024 | OK |
| Feature graphic | `store-assets/android/feature-graphic-1024x500.png` | 1024×500 PNG | OK — drop straight into Play |
| Phone screenshots | `store-assets/android/ScreenShots-Phone/01..05*.png` | dimensions not yet verified | **5 present**, target is 8 |
| iOS screenshots (informational) | `store-assets/ios/ScreenShots-6.9-inch/01..05*.png` | — | not used for Play |
| 7" tablet screenshots | — | — | **MISSING** (optional but recommended) |
| 10" tablet screenshots | — | — | **MISSING** (optional but recommended) |

### 1.4 Recommendations (no code changes required for v1)
1. **Adaptive icon:** the current foreground is a full 1024×1024 image including padding. Android masks adaptive icons in a circle/squircle which can crop important pixels. Re-export the adaptive icon foreground with the actual logo in the safe zone (centered ~66% — i.e. logo fits inside a 660×660 region of the 1024 canvas). Recommended new asset: `store-assets/android/adaptive-icon-foreground-safe.png`.
2. **Icon alpha:** Play Store icon (the 512×512 one we upload separately) accepts transparency, but the source `mobile/assets/icon.png` is RGB with no alpha — that is fine. Just ensure the dedicated 512×512 listing icon is exported with the same artwork (see §3).
3. **Add `submit.production.android` block to `eas.json`** before submit (see §7).
4. **Push at least 3 more phone screenshots** (target 8 of 8 slots filled — converts better).

### 1.5 Library → Data Safety mapping (used in §5)
From `mobile/package.json`:
| Library | Surface that triggers a Play disclosure |
|---|---|
| `expo-notifications` | Push token (device identifier-ish) |
| `expo-image-picker` | Photos / videos access (only when user picks) |
| `expo-document-picker` | Files (only when user picks) |
| `expo-secure-store` | On-device encryption for auth tokens (positive disclosure: encrypted in transit/at rest) |
| `@supabase/supabase-js` | Network: account info, messages, files. Collected and stored. |
| `expo-updates` | App update metadata only |
| `expo-device`, `expo-constants` | Device model, OS version (diagnostics) |
| `@tanstack/react-query` | No additional collection |
| `expo-linking` | Deep links — no PII |

There is **no** advertising SDK, no analytics SDK, no crash-reporter SDK. That keeps the Data Safety form simple.

---

## 2. Store listing copy

### 2.1 Arabic (primary, `ar-SA`)

**App title** (max 30 chars):
```
نِهجز بوت — مساعد واتساب
```
*(28 chars)*

**Short description** (max 80 chars):
```
مساعد ذكاء اصطناعي يدير محادثات واتساب لنشاطك التجاري ويردّ على عملائك تلقائيًا
```
*(78 chars)*

**Promotional text** (max 170 chars — Play uses it on featuring banners):
```
ردود ذكية، قاعدة معرفة، تصعيد لحظي، وحملات تسويقية — كل خدمة عملاء واتساب لنشاطك في مكان واحد. مصمّم خصيصًا للسوق السعودي.
```

**Full description** (max 4000 chars):
```
نِهجز بوت هو مساعدك الذكي لإدارة خدمة عملاء واتساب بزنس لنشاطك التجاري — من الرد التلقائي على الأسئلة الشائعة، إلى تصعيد المحادثات الحساسة، إلى إرسال حملات تسويقية احترافية بضغطة واحدة.

مصمّم خصيصًا للأنشطة في السوق السعودي، وبواجهة عربية كاملة.

✦ بريد واتساب موحّد على جوالك
شُف كل محادثاتك مع عملائك في مكان واحد، مع تنبيهات لحظية للرسائل المهمة.

✦ ردود ذكاء اصطناعي تتكلم بلهجتك
الذكاء الاصطناعي يقترح أو يرد تلقائيًا اعتمادًا على قاعدة المعرفة الخاصة بنشاطك. أنت اللي تختار: رد تلقائي كامل، أو مسوّدة يراجعها الموظف.

✦ قاعدة معرفة مرنة
ارفع أسعارك، خدماتك، أوقات العمل، الأسئلة الشائعة — والذكاء الاصطناعي يجاوب عملاءك من خلالها.

✦ تصنيفات وتصعيدات
صنّف المحادثات (طلب جديد، شكوى، استفسار…) وحدّد القواعد اللي تحوّل المحادثة لموظف بشري — تتنبّه فورًا على الجوال.

✦ حملات تسويقية مستهدفة
أرسل قوالب واتساب الرسمية لقاعدة عملائك بضغطة، وتابع نتائج التسليم والقراءة.

✦ فريق وأدوار
أضف موظفي خدمة العملاء، وزّع المناوبات، وراقب أداء الفريق.

✦ آمن وخاص
البيانات محفوظة بقواعد بيانات مشفّرة، ومصرّح به رسميًا عبر واجهة WhatsApp Cloud من ميتا. ما نبيع بيانات، وما نستخدم رسائل عملائك لتدريب نماذج خارجية.

من يستخدم نِهجز بوت؟
- المتاجر الإلكترونية
- المطاعم والكافيهات
- العيادات والمراكز
- وكلاء العقار والسيارات
- مزوّدو الخدمات الحرفية
- أي نشاط يستقبل طلبات أو استفسارات على واتساب

✦ متطلبات
- حساب واتساب بزنس مرتبط بـ WhatsApp Business Platform (Cloud API)
- اتصال إنترنت
- اشتراك نِهجز فعّال

نِهجز بوت أداة احترافية موجّهة لأصحاب الأنشطة وفرقهم. إذا حاب توصلك خدمة عملاء أفضل وتنام مرتاح، حمّل التطبيق وابدأ.

للدعم: support@nehgzbot.com
سياسة الخصوصية: https://nehgz.com/privacy
شروط الاستخدام: https://nehgz.com/terms
```

### 2.2 English (`en-US`)

**App title** (max 30 chars):
```
Nehgz Bot — WhatsApp Assistant
```
*(30 chars)*

**Short description** (max 80 chars):
```
AI-powered WhatsApp customer service for your business — replies, KB, campaigns
```
*(78 chars)*

**Promotional text** (max 170 chars):
```
Smart replies, knowledge base, live escalations, marketing campaigns — your full WhatsApp customer service in one place. Built for Saudi Arabia.
```

**Full description**:
```
Nehgz Bot is your AI assistant for managing WhatsApp Business customer service — from auto-replying to common questions, to escalating sensitive chats to a human, to sending professional marketing campaigns in one tap.

Designed for businesses in Saudi Arabia, with a fully Arabic interface and Saudi-dialect-aware AI.

✦ Unified WhatsApp inbox on your phone
See every customer conversation in one place, with instant push notifications for what matters.

✦ AI replies that speak your language
The AI drafts (or auto-sends) replies grounded in your business's knowledge base. You choose: full auto-reply, or agent-reviewed drafts.

✦ Flexible knowledge base
Upload pricing, services, hours, FAQs — the AI answers your customers from your own content.

✦ Labels & escalations
Tag conversations (new order, complaint, inquiry…) and set rules to hand off to a human agent — get notified instantly.

✦ Targeted marketing campaigns
Send approved WhatsApp templates to your customer list in one click. Track delivery and read receipts.

✦ Team & roles
Add agents, assign shifts, and monitor team performance.

✦ Secure & private
Encrypted data, official WhatsApp Cloud API integration from Meta. We don't sell your data, and we don't train external models on your customers' messages.

Who uses Nehgz Bot?
- E-commerce stores
- Restaurants & cafés
- Clinics & medical centers
- Real-estate & auto agents
- Service providers
- Any business taking orders or inquiries over WhatsApp

✦ Requirements
- A WhatsApp Business account on the WhatsApp Cloud API
- Internet connection
- Active Nehgz subscription

Support: support@nehgzbot.com
Privacy: https://nehgz.com/privacy
Terms: https://nehgz.com/terms
```

---

## 3. Required graphic assets — exact specs

> Play Console field name → spec → status → action.

| Field | Spec (Play exact) | Present? | Action |
|---|---|---|---|
| **App icon** | 512×512 PNG, 32-bit (with alpha), max 1 MB | Source 1024×1024 in repo | Export `store-assets/android/listing-icon-512.png` from `mobile/assets/icon.png` (use `sips -z 512 512` or Figma) |
| **Feature graphic** | 1024×500 PNG or JPG, no alpha, no text near edges | Yes, `store-assets/android/feature-graphic-1024x500.png` | Use as-is. Verify text isn't clipped on small banners. |
| **Phone screenshots** (min 2, max 8) | 16:9 or 9:16, min side ≥ 320px, max side ≤ 3840px, 8 MB each, JPG/PNG 24-bit | 5 present in `store-assets/android/ScreenShots-Phone/` | Add 3 more (suggested below) to fill all 8 slots |
| **7" tablet screenshots** (optional) | min 320px, max 3840px, up to 8 | None | Optional — produce 2-4 if you want better tablet visibility |
| **10" tablet screenshots** (optional) | min 1080px, max 7680px, up to 8 | None | Optional |
| **Promo video** (optional) | YouTube URL | None | Skip for v1 |

### 3.1 Existing phone screenshot inventory (5/8)

| File | Suggested Arabic caption overlay |
|---|---|
| `01-inbox.png` | بريد واتساب موحّد لكل عملائك |
| `02-ai-chat.png` | الذكاء الاصطناعي يردّ بلهجتك |
| `03-bookings.png` | كل الحجوزات في مكان واحد |
| `04-team-shifts.png` | وزّع المناوبات وراقب الأداء |
| `05-campaigns.png` | حملات تسويقية بضغطة واحدة |

### 3.2 Recommended additional 3 screenshots to produce

| # | Screen content | Arabic caption |
|---|---|---|
| 06 | Knowledge base editor with FAQ entries | قاعدة معرفة تتكلم نيابةً عنك |
| 07 | Conversation labels & escalation rules screen | تصنيف وتصعيد ذكي للمحادثات |
| 08 | Notification on lock screen + the chat opening from it | تنبيهات لحظية ما تفوّتك أي عميل |

### 3.3 English caption variants (for the en-US listing — same screenshots, different overlays)
1. Unified WhatsApp inbox · 2. AI replies in your tone · 3. All bookings in one place · 4. Shifts & team performance · 5. Marketing campaigns in one tap · 6. A knowledge base that speaks for you · 7. Smart labeling & escalation · 8. Real-time alerts so no customer is missed.

---

## 4. Categorization, tags, content rating, target audience

### 4.1 Category & tags
- **Application category:** Business *(recommended over Productivity — the app is clearly a B2B tool aimed at businesses)*
- **Tags (up to 5):** `Business communication`, `Customer service`, `Team collaboration`, `Marketing tools`, `Small business`

### 4.2 Content rating questionnaire (IARC) — answers
Run the IARC questionnaire under **App content → Content ratings**. Answer **No** to every category below. Expected outcome: rating "Everyone" (or "3+" / "ESRB Everyone"). The app contains no objectionable content, but we restrict it via the **target audience** to 18+ (next section).

| Question category | Answer |
|---|---|
| Violence (cartoon, fantasy, realistic) | No |
| Sexual content / nudity / suggestive | No |
| Profanity / crude humor | No |
| Drug, alcohol, tobacco references | No |
| Simulated gambling / real-money gambling | No |
| Horror / fear-inducing content | No |
| User-generated content shared publicly | **No** — conversations are private between the business and its customer; nothing is broadcast publicly inside the app |
| Users can interact with each other | **Yes** — WhatsApp messaging is at the core. (Play asks specifically: enable the "Users interact" disclosure. The app is **not** a social network and conversations are private B2C / business↔customer.) |
| Users can share their location | No |
| Users can share personal info publicly | No |
| Digital purchases | **No** in v1 (no in-app purchases yet). If billing moves in-app later, update this. |
| Diversity / representation issues | N/A |

### 4.3 Target audience & content
- **Target age group:** 18+ only.
- **Appeals to children?** No.
- **Ads?** No, the app contains no ads.
- **News app?** No.
- **COVID-19 contact tracing / status app?** No.
- **Government app?** No.
- **Financial features?** No.
- **Health features?** No.

### 4.4 Government App declaration
No.

### 4.5 News App declaration
No.

---

## 5. Data Safety form — full draft

> Paste these answers into **App content → Data safety**. Sections follow the Play Console UI order.

### 5.1 Data collection & security (top-level)

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS / TLS to Supabase, Vercel, Meta, Google) |
| Do you provide a way for users to request that their data be deleted? | **Yes** (in-app account deletion + email request to support@nehgzbot.com) |
| Have you complied with Families policy? | **Not applicable** — app is 18+, not for children |

### 5.2 Data types — declarations

For every row: **Collected** = data leaves device, **Shared** = sent to a third party that uses it for its own purposes (we set this to **No** for everything because all third parties below are sub-processors operating under our instructions, which Play classifies as "collected, not shared"). **Optional** = the user can use the app without providing it. **Purpose** options chosen are limited to the ones Play accepts.

#### Personal info
| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Name | Yes | No | No | App functionality, Account management |
| Email address | Yes | No | No | App functionality, Account management |
| User IDs (workspace ID, user ID) | Yes | No | No | App functionality, Account management |
| Phone number | Yes | No | No | App functionality *(end-customer phone numbers are stored to display conversations)* |
| Address | No | — | — | — |
| Race/ethnicity, political/religious beliefs, sexual orientation, other sensitive | No | — | — | — |

#### Financial info
None collected. *(No in-app purchases in v1, no payment data in the mobile app — billing is handled outside the app on the web dashboard.)*

#### Health and fitness
None.

#### Messages
| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Other in-app messages (WhatsApp messages routed via the business's connected number) | **Yes** | No | No | App functionality |
| Emails | No | — | — | — |
| SMS or MMS | No | — | — | — |

> Note in the description field: *"The app stores WhatsApp Business conversations between the business and its customers, on behalf of the business owner who is the data controller. Required to operate the customer-service inbox."*

#### Photos and videos
| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Photos | Yes | No | Yes | App functionality *(only photos the user explicitly attaches to a conversation or campaign)* |
| Videos | No | — | — | — |

#### Audio files
None.

#### Files and docs
| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Files and docs | Yes | No | Yes | App functionality *(only when user attaches a document)* |

#### Calendar / Contacts
None.

#### App activity
| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| App interactions | Yes | No | No | Analytics, App functionality *(in-app navigation events for product reliability — non-identifying aggregates)* |
| In-app search history | No | — | — | — |
| Installed apps | No | — | — | — |
| Other user-generated content (knowledge base, labels, campaigns) | Yes | No | No | App functionality |
| Other actions | No | — | — | — |

#### Web browsing
None.

#### App info and performance
| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Crash logs | Yes | No | No | App functionality (Diagnostics) |
| Diagnostics | Yes | No | No | App functionality (Diagnostics) |
| Other app performance data | No | — | — | — |

#### Device or other IDs
| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Device or other IDs (Expo Push token) | Yes | No | No | App functionality (delivering push notifications) |

#### Location
None. *(We do not request fine or coarse location.)*

### 5.3 Security practices block (free-text)
- Data is encrypted in transit (HTTPS / TLS 1.2+) — **Yes**.
- You can request that data be deleted — **Yes** (Settings → Account → Delete Account, or email support@nehgzbot.com).
- Independent security review — **Not committed yet**. Leave unchecked for v1.
- Follows Play Families Policy — **Not applicable** (app is 18+).

### 5.4 Privacy policy URL (required)
Host a public URL of `docs/privacy-policy-en.md` and `docs/privacy-policy-ar.md`. Recommended:
- `https://nehgz.com/privacy` (Arabic, primary)
- `https://nehgz.com/privacy/en`

You may host on Vercel under `/privacy` and `/privacy/en` routes in the existing `nehgzbot.com` project until the custom domain is ready. The URL **must** be reachable at the time of submission.

---

## 6. Privacy policy

Already created in this PR:
- `docs/privacy-policy-ar.md` — Arabic (primary), public URL TBD
- `docs/privacy-policy-en.md` — English

Owner action: deploy both as static pages and put their public URLs in:
- Play Console → App content → Privacy policy
- Inside the app (Settings → About → Privacy policy)

---

## 7. EAS production build & submit flow

### 7.1 Pre-flight (run from `mobile/`)
```bash
# 1. Make sure you're logged in to the right Expo account (mahm0udsaad)
eas whoami

# 2. Confirm the project link
cat app.json | grep projectId
# expected: a7b7daaf-c9db-427e-9e3b-fc032fb045ef

# 3. Sync the remote versionCode bookkeeping (because eas.json uses appVersionSource: remote)
eas build:version:get --platform android --profile production
# If first prod build, set initial version code:
# eas build:version:set --platform android --profile production --value 1
```

### 7.2 Build the AAB
```bash
cd mobile
eas build --platform android --profile production
```
- Output: `.aab` (Android App Bundle), default for production profiles.
- EAS auto-increments the Android `versionCode` because `cli.appVersionSource` is `remote`.
- The app version (`versionName`) comes from `expo.version` in `app.json` (currently `1.0.0`).
- Build time: ~10-20 min on EAS cloud.
- When done, EAS prints a download URL for the AAB.

### 7.3 Submit to Play Console (two options)

#### Option A — manual upload (recommended for first release)
1. Download the AAB from the EAS build page.
2. In Play Console → **Production** → **Create new release** → upload AAB.
3. Fill release notes (see §8).
4. Review and roll out.

This avoids needing the service-account JSON for the first release and lets you eyeball the upload.

#### Option B — automated via `eas submit`
1. Add this block to `mobile/eas.json` (currently missing):
```json
"submit": {
  "production": {
    "android": {
      "serviceAccountKeyPath": "../secrets/play-service-account.json",
      "track": "production",
      "releaseStatus": "draft"
    },
    "ios": {
      "appleId": "support@nehgzbot.com",
      "ascAppId": "6762078573"
    }
  }
}
```
2. Place the service account JSON at `secrets/play-service-account.json` (gitignored). Generate it from Google Cloud Console → IAM → Service accounts → grant **Service Account User** + invite that email in Play Console → Users & permissions with **Release apps to production** permission.
3. Run:
```bash
cd mobile
eas submit --platform android --profile production --latest
```
`--latest` picks the most recent successful build for the production profile. `releaseStatus: draft` puts it in Play as a draft so you can hit "Review release" manually — safer for the first time.

### 7.4 Promote draft → review → rollout
After upload (either path):
1. Play Console → Production → **Edit release** → confirm AAB, set release name (e.g. `1.0.0 (1)`).
2. Paste release notes per locale (see §8).
3. **Review release** → fix any policy warnings → **Start rollout to production**.
4. Initial rollout: 20% staged is recommended for a v1 to catch crashes early; bump to 100% after 48h of clean Vitals.

---

## 8. Submission checklist (ordered punch list)

Walk top to bottom; each item is a Play Console step or an external task.

### A. Account & access
- [ ] Verify Play Console developer account is in good standing and the **Owner** of app `4972699644480779922` has signing access.
- [ ] App signing — confirm **Play App Signing is enabled** (Setup → App integrity). Required for AAB.
- [ ] Two-step verification on the Google account that owns the developer account.

### B. Setup tasks (App content)
- [ ] **Privacy policy URL** — paste deployed URL.
- [ ] **App access** — choose "All functionality is available without special access" if you accept reviewer test instructions, OR choose "All or some functionality is restricted" and provide a demo account: email + password + the WhatsApp Business test number setup steps. **Recommended: provide test credentials**, otherwise Google will reject.
- [ ] **Ads** — "No, my app does not contain ads."
- [ ] **Content rating** — fill IARC questionnaire per §4.2.
- [ ] **Target audience** — 18+ (§4.3).
- [ ] **News apps** — No.
- [ ] **COVID-19 contact tracing** — No.
- [ ] **Data safety** — fill per §5.
- [ ] **Government apps** — No.
- [ ] **Financial features** — No.
- [ ] **Health** — No.

### C. Store listing (per locale: ar-SA primary, en-US secondary)
- [ ] App name (§2)
- [ ] Short description (§2)
- [ ] Full description (§2)
- [ ] App icon 512×512 (export from `mobile/assets/icon.png`)
- [ ] Feature graphic 1024×500 (`store-assets/android/feature-graphic-1024x500.png`)
- [ ] Phone screenshots (min 2 — we have 5; add 3 more to reach 8)
- [ ] 7"/10" tablet screenshots (optional)
- [ ] Promo video URL (skip)
- [ ] App category: **Business**
- [ ] Tags: see §4.1
- [ ] Contact email: `support@nehgzbot.com`
- [ ] Contact phone: optional
- [ ] Contact website: `https://nehgz.com`
- [ ] External marketing — opt out (uncheck "Allow Google to advertise") unless you want it

### D. Build
- [ ] `eas build --platform android --profile production` (§7.2)
- [ ] Download AAB or use `eas submit`

### E. Production release
- [ ] Production → Create new release → upload AAB
- [ ] Release name: `1.0.0`
- [ ] Release notes (ar-SA):
  ```
  الإصدار الأول من نِهجز بوت — مساعد واتساب الذكي لإدارة خدمة عملاء نشاطك التجاري.
  ```
- [ ] Release notes (en-US):
  ```
  First release of Nehgz Bot — your AI WhatsApp customer-service assistant.
  ```
- [ ] **Countries / regions:** Saudi Arabia (start narrow). Add GCC/MENA later if you confirm WhatsApp Cloud API works there for your tenants.
- [ ] Review release → fix policy warnings → **Start rollout to production** (20% staged).

### F. Post-submission
- [ ] Watch Play Console → Quality → Android Vitals for 48h.
- [ ] If crash-free rate ≥ 99%, ramp rollout to 100%.
- [ ] Add the listing URL to your marketing site once Google publishes it (typically 1–7 days).

---

## 9. Known blockers / open items the owner must resolve

1. **Privacy policy must be live at a public URL** before submission. Files exist (`docs/privacy-policy-{ar,en}.md`) but need to be deployed (recommend Vercel route under `nehgzbot.com/privacy`).
2. **Service account JSON for `eas submit`** is not provisioned. Optional for first release (use manual upload Option A).
3. **3 missing phone screenshots** (we have 5, target 8). Specs in §3.2.
4. **Adaptive icon foreground** should be re-exported with logo inside the safe zone (§1.4 #1) to avoid masking on Android 13+.
5. **`submit.production.android` block missing in `eas.json`** — only required if you go with submit Option B.
6. **App access / reviewer credentials** — reviewers cannot sign up to a B2B SaaS without help. Prepare a demo workspace + login that auto-resets nightly, or send static credentials in the App Access form.
7. **Listing icon 512×512 PNG** is not yet exported (source 1024×1024 is in repo).
