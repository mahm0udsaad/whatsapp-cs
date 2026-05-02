# Nehgz Bot — Store Submission Assets

Generated assets ready for App Store Connect and Google Play Console.
The app name and icon are aligned: `Nehgz Bot` everywhere, same logo
(NEHGZ + تحجز + Bot wordmark on brand navy `#182C6E`).

## Layout

```
store-assets/
├── README.md                                    ← this file
├── ios/
│   ├── AppIcon-1024.png                         ← App Store icon (1024×1024 PNG, no alpha)
│   └── ScreenShots-6.9-inch/                    ← required for new submissions
│       ├── 01-inbox.png                         ← 1320×2868
│       ├── 02-ai-chat.png
│       ├── 03-bookings.png
│       ├── 04-team-shifts.png
│       └── 05-campaigns.png
└── android/
    ├── adaptive-icon-foreground.png             ← drop into mobile/assets if you want to update the in-app icon
    ├── feature-graphic-1024x500.png             ← Play Store feature graphic
    └── ScreenShots-Phone/                       ← phone screenshots
        ├── 01-inbox.png                         ← 1080×1920
        ├── 02-ai-chat.png
        ├── 03-bookings.png
        ├── 04-team-shifts.png
        └── 05-campaigns.png
```

The five screenshots cover the four marketing pillars from the listing:

| # | Screen | Headline (AR) | Subhead (EN) |
|---|---|---|---|
| 01 | WhatsApp inbox | محادثات الواتساب في مكان واحد | Every chat. Every team. Every escalation. |
| 02 | AI conversation | ذكاء اصطناعي يرد عن عملك على مدار الساعة | AI replies in Arabic & English. Books, upsells, escalates. |
| 03 | Bookings + analytics | حجوزات وطلبات تلقائية | Bookings captured straight from WhatsApp into your dashboard. |
| 04 | Team & shifts | فريقك ومناوباتك بضغطة زر | Schedule shifts, assign roles, never miss an escalation. |
| 05 | Campaigns | حملات واتساب معتمدة وآمنة | Approved templates, segmented sends, real-time analytics. |

## How to upload

### App Store Connect (iOS)

1. **Apps → Nehgz Bot → 1.0 Prepare for Submission**
2. Drag the five PNGs from `ios/ScreenShots-6.9-inch/` into the **iPhone 6.9" Display** slot. App Store Connect will auto-fill the 6.5" slot from these — no separate set needed.
3. **App Information → App Icon**: upload `ios/AppIcon-1024.png` if not already present.
4. Paste the listing copy from `app-store-listing.md` (already in the repo root) into Subtitle / Promotional Text / Description / Keywords / URLs.
5. The remaining required fields (App Privacy survey, Age Rating, Review Notes, Demo Account) are pre-drafted in `app-store-listing.md`.

### Google Play Console (Android)

1. **Play Console → Nehgz Bot → Main store listing**
2. **Phone screenshots**: drag the five PNGs from `android/ScreenShots-Phone/`.
3. **Feature graphic**: upload `android/feature-graphic-1024x500.png`.
4. **App icon**: Play uses the icon embedded in the AAB; no separate upload.

## Important: pre-submission checklist

The repo has two cosmetic mismatches to address before first Play submission:

- **Android package id** in `mobile/app.json` → currently `com.whatsappcs.agentconsole` while iOS is `com.nehgz.nehgzbot`. For a fresh Play Store listing, change the Android package to `com.nehgz.nehgzbot` so both stores share a brand id. (Skip this change if you've already shipped a Play build under the old id — package id can't change post-release.)
- **`scheme`** in `mobile/app.json` is still `whatsapp-cs-agent`. Optional cleanup: rename to `nehgzbot`. Will change deep link URLs.

Neither blocks iOS submission today — `app.json`'s `name`, iOS `bundleIdentifier`, the icon, and the splash all already say Nehgz Bot.

## Regenerating

The screenshots are not photos — they're rendered programmatically via Pillow (with RAQM for proper Arabic shaping). If you want to tweak copy, edit and re-run:

```
python3 build_screenshots.py     # source lives alongside this README in the outputs folder
```

The script uses Noto Sans Arabic + Inter (both pulled from the project's existing Next.js bundle, so no external download required).

> Note about Gemini: the original request was to generate previews via the
> `gemini-3.1-flash-image-preview` model. The build environment couldn't reach
> `generativelanguage.googleapis.com`, and image-generation models also tend to
> mangle Arabic text in mockups. Programmatic rendering produces sharper, brand-exact
> results, so that's what's shipped here. Swap in Gemini-generated artwork later if
> you want photographic backgrounds; the headline / phone-frame composition can
> stay as-is.
