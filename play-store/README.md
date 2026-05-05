# Play Store submission package — Nehgz Bot

Everything you need to ship `com.nehgz.nehgzbot` to the Google Play Store as a manual upload. Files are numbered in the order you'll use them inside Play Console.

## Files

| # | File | What it's for |
|---|---|---|
| 1 | [`01-store-listing.md`](./01-store-listing.md) | App name, short + full descriptions in Arabic and English. Copy-paste into Play Console → Main store listing. |
| 2 | [`02-data-safety.md`](./02-data-safety.md) | Every answer for the Data Safety form, cross-checked against your existing `privacy` page. |
| 3 | [`03-content-rating.md`](./03-content-rating.md) | IARC questionnaire answers. Expected outcome: rated **3+ / Everyone**. |
| 4 | [`04-privacy-policy.md`](./04-privacy-policy.md) | Confirms your live policy at `/privacy` is enough; lists checks to run before submission. |
| 5 | [`05-submission-checklist.md`](./05-submission-checklist.md) | The single document to keep open while you click through Play Console. |
| 6 | [`06-graphic-assets.md`](./06-graphic-assets.md) | What graphics Play requires, what you have, what to capture, exact `adb` commands. |

## Suggested order (~60–90 min)

1. Skim `05-submission-checklist.md` end-to-end so you know what's coming.
2. Capture the screenshots and feature graphic per `06-graphic-assets.md` (this is usually the slowest step — do it first while the rest waits).
3. Confirm the privacy URL is live: `curl -sIL https://nehgzbot.com/privacy`.
4. Open Play Console and walk through `05-submission-checklist.md` top-to-bottom, copying answers from `01`, `02`, `03` into the relevant Play sections.
5. Upload the AAB → release notes → **Send for review**.

## Open items I need from you before final submit

- [x] **AAB file** — confirmed at `/Users/mahmoudmac/Downloads/2.aab`. (Sandbox couldn't run `bundletool` to inspect; if you want to double-check versionCode before upload, run `bundletool dump manifest --bundle ~/Downloads/2.aab | grep -E 'package|versionCode'`.)
- [x] **Custom domain** — listing now uses `https://nehgzbot.com` and `https://nehgzbot.com/privacy`. Make sure the domain is wired to the Vercel project (Vercel → Domains → add `nehgzbot.com`) before you submit so the URLs return 200.
- [x] **Web delete-account page** — added at `src/app/(public)/delete-account/page.tsx` (public, no login). Footer link added. Will be live at `https://nehgzbot.com/delete-account` after the next deploy.
- [ ] **In-app delete-account button** — still needed. Play prefers in-app over email for any app with user accounts. The web form covers the requirement, but adding a Profile-screen button that calls `/api/account/delete` is stronger. Tell me when you want it wired up.
- [ ] **Reviewer login** — please create `reviewer@nehgzbot.com` (or any test address) on the production environment, seed it with one demo restaurant + a few conversations, then send me the password so I can plug it into the App Access section template.
- [ ] **Personal vs. organization Play account** — if your Play developer account was created after Nov 2023 as personal, Play forces 14 days of closed testing with 12+ testers before production is unlocked. Check Play Console → Setup → App content → "Production access" and tell me what you see.

## Cited from the codebase

- App config: `mobile/app.json` — `com.nehgz.nehgzbot`, version 1.0.0, owner `mahm0udsaad`, EAS project `a7b7daaf-...`.
- Build profiles: `mobile/eas.json` — `preview` and `production` profiles now point at `https://nehgzbot.com`. The existing `2.aab` was built before this change, so it still calls `whatsapp-cs.vercel.app`; keep that Vercel alias active alongside `nehgzbot.com` so the released build keeps working until the next AAB ships and replaces it.
- Live privacy policy: `src/app/(public)/privacy/page.tsx` (already deployed).
- App features summarized from: `mobile/app/(app)/overview.tsx`, `inbox/index.tsx`, `campaigns/index.tsx`, `team/index.tsx`, `customers/index.tsx`, `shifts.tsx`, `approvals.tsx`.
