# Nehgz Hub attendance (HR) — progress summary

Date: 2026-11-08 · Branch: `codex/nehgz-hub-hr-demo` · Status: **committed and preview published**

This summarizes the work done against [nehgz-hub-hr-ui-plan.md](nehgz-hub-hr-ui-plan.md). The employee UI still runs on **local demo data only** while the native camera and hardware-key work is pending. The published HR API is now verified and a production-safe client adapter is implemented behind the UI boundary.

## In one paragraph

The mobile app now opens straight into Nehgz Hub (the Hub/Bot chooser is gone). Hub has a new **Attendance (الحضور)** tab with the full employee journey from the prototype: activate the phone with an HR code, confirm identity, first door scan, wait for approval, then check in/out, presence checks, history, account and help. It was rebuilt on a new shadcn-style component kit for a cleaner, modern look, in Arabic (RTL) first with English and dark mode. A 48-second demo video was recorded for the Hub owner.

## Sources used

- Prototype: https://alwaset-logistics.com/hr/ (25 screens)
- `Nehgz-HR-Employee-App.postman_collection.json`: API shapes, error codes, punch and retry rules
- `google-services.json` / `GoogleService-Info.plist`: read only, **not added to the app** (see Open issues)

## What was built

### 1. Navigation (Hub first)

- Login and cold start open Hub directly. The old chooser route (`(gateway)/select`) now just redirects.
- Tabs: **Overview / Bookings / Attendance / Team / More**. Services moved under More.
- Managers keep bookings, team, services and pairing. Agents see Overview, Attendance and More, with no manager-only API calls.
- Attendance works even if the merchant store isn't paired or the store API fails (`components/hub-merchant-gate.tsx`).
- WhatsApp opens from More (managers → overview, agents → inbox). WhatsApp Profile has "العودة إلى نِحجز هَب" for every role.
- Safe login return links (`lib/navigation.ts`): only `/hr/...` and `/bookings/...` are kept; an invite code is kept only for `/hr/activate`.
- Presence-check notifications open the right check (`lib/hr-notifications.ts`). Only numeric IDs are accepted.
- `/activate?code=...` invitation entry (`app/activate.tsx`).

### 2. UI kit (shadcn-style) — `mobile/components/ui/`

Built in the shadcn / react-native-reusables style: semantic color tokens, `cva` variants and a `cn()` class helper. Added packages: `clsx`, `tailwind-merge`, `class-variance-authority`.

| Component | Use |
| --- | --- |
| `ThemeScope`, `useTheme` | Light/dark tokens + RTL/LTR per screen |
| `Text`, `NumberText` | Type scale; numbers/times stay left-to-right inside Arabic |
| `Button` | default, secondary, outline, ghost, accent, destructive |
| `Card`, `Badge`, `Alert` | Content blocks and status chips (always words + color) |
| `InputOTP` | 8-box activation code, paste-friendly, ignores dashes/spaces |
| `SegmentedControl` | Today/History/Account switcher, date ranges, language |
| `List`, `ListItem`, `Switch`, `AccordionItem` | Settings and FAQ rows |
| `Progress`, `IconTile`, `Separator`, `Sheet` | Countdown bar, icons, bottom sheet |

Brand colors kept: blue `#011F91`, yellow `#FCBD05`. Tap targets are 44–52 pt or larger.

### 3. Attendance screens — `mobile/features/hr/screens/`

| Screen | Highlights |
| --- | --- |
| Welcome | One clear action: "لديّ رمز تفعيل" |
| Code entry | Step 1/3, OTP boxes, auto-continues at 8 characters, demo code chip |
| Is this you? | Name, job, company; "not me" returns to code entry |
| Protect with fingerprint | Explains biometrics stay on the phone; marked as demo |
| Last step at the door | 3 numbered steps |
| Waiting for approval | Progress checklist, "check now", demo approve |
| Today | Greeting, status badge, big check-in/out button, arrival/leaving/worked tiles, shift, presence banner |
| Scanner | Dark full screen, animated scan line, fingerprint / phone passcode / cancel |
| Result | "تم تسجيل حضورك" + time; presence result says times are unchanged |
| Presence check | Countdown ring + bar (turns red under 1 min); "check 1 of 2" when several |
| History | This week / this month / last month, totals, day rows (late, missing scan, leave, weekend, night shift `+1`) |
| Account | Profile, language (ع/EN), dark mode, notifications, device, workplace, help, HR sign-out with warning |
| Help | Code steps + FAQ (lost phone, new phone, expired code, no internet) |
| Errors | Expired/invalid QR, already registered, offline, unconfirmed timeout, revoked phone, blocked employee, bad codes, rate limit |

Errors are handled by error **code**, not message text (`features/hr/errors.ts`).

### 4. Demo data — `mobile/features/hr/`

- `mock-service.ts`: fake HR API following the Postman rules. The server decides in/out and time, a retry reuses the same request ID (no duplicate punch), 2-minute cooldown, no offline queue, presence never changes attendance.
- `fixtures.ts`: fictional employee "أحمد سالم", company "شركة الأفق للتجارة", Riyadh time, fixed demo clock.
- `store.ts` / `hooks.ts`: demo state kept per app account; cleared on account change.
- **Demo controls** (tap the "تجريبي" badge, dev/preview builds only): switch between 23 scenarios, send a presence check, move the clock +5 min, reset.
- Demo code: **K7QM-4XHT**.

### 5. Published employee API foundation

- Confirmed base URL: `https://nehgzhub-hr.com/api/v1`.
- Smoke-tested the live contract on 2026-11-08: `GET /app/me` returned the documented `401 unauthenticated`; invalid `POST /app/activation/verify` returned the documented structured `422 activation_code_invalid` response and rate-limit headers.
- `features/hr/api-client.ts` implements activation, device status, today, punch, history, presence, push-token and logout routes with typed responses and structured errors.
- `features/hr/token-store.ts` keeps the employee phone token in `expo-secure-store`; revoked/invalid sessions clear it.
- Signed attendance writes are never retried automatically. The caller must explicitly retry the same signed body and `client_request_id`.
- `EXPO_PUBLIC_HR_API_URL` is configured for development, preview and production EAS profiles.
- The live adapter is intentionally not selected by the UI yet. Activation completion and attendance require the real hardware-backed P-256 signer and QR camera, so switching early would create an insecure or incomplete flow.

### 6. Routes

- In Hub: `app/(hub)/(tabs)/hr/*` → `/hr`, `/hr/today`, `/hr/history`, …
- Sign-in-free preview for testers: `app/hr-preview/*` (dev/preview builds only). Open `whatsapp-cs-agent://hr-preview`, or in Expo Go `exp://<host>:<port>/--/hr-preview`.

### 7. Demo video

[`docs/demo/hr-attendance-demo.mp4`](demo/hr-attendance-demo.mp4): 48 s, 720p, ~1.1 MB, Arabic, no sound.
Shows activation → door scan → approval → check-in → history → account → home "on duty".
Two check-in frames (fingerprint confirm and "08:05") are stills from screenshots because the simulator recorder dropped them. Dark mode, English, presence checks and errors are not in the video.

## Verification

- `npx tsc --noEmit` — passes
- `bun run test` — **11 suites, 98 tests pass**, including the new live API client, `hr-demo`, `hr-ui-logic`, `hr-notifications` and `hub-navigation` tests
- Lint: no errors in new files (one existing-style warning in `features/hr/hooks.ts`)
- Checked on the iOS simulator (iPhone 16e, Expo Go): Arabic RTL, English LTR, dark mode, activation, check-in, history, account, demo controls
- **Not checked:** Android, large text sizes, the in-Hub tab with a real signed-in manager/agent

## Publication

- Git branch: `codex/nehgz-hub-hr-demo`.
- EAS Update preview group: `2ff750b2-3912-4bf8-9fd1-ced7e8e2ed5d` (Android and iOS, runtime `1.0.6`).
- Fresh Android preview build: `259a7f85-cf56-4153-afa6-f90beb1c6fc9` (queued on 2026-11-08).
- A fresh iOS internal preview could not be created non-interactively because the Expo project has no suitable internal-distribution provisioning credentials. Existing iOS runtime `1.0.6` builds can receive the preview OTA, but the new native `nehgz://` scheme requires a newly signed iOS build.
- EAS archive contents were inspected before the build. The final archive is about 12 MB and excludes the repository `.git`, server `.env.local`, backend sources, generated bundles and video output.

## Open issues / next steps

1. **Firebase app IDs don't match.** The app is `com.nehgz.nehgzbot`; the files are for `com.hr.app` (Android) and `com.nehgz.app` (iOS). New Firebase files are needed before push can be wired. The files were not added.
2. **Push:** the app uses Expo push tokens; HR expects FCM. Needs agreement.
3. **Fingerprint signing:** real hardware-key signing needs a native module in a dev build.
4. **History data:** day statuses and totals (late, leave, weekend) are demo-only; the API returns only punches.
5. **Identity link:** how HR employees map to Nehgz app accounts is undecided.
6. Dark-mode switch stopped responding once during recording; worth re-checking.
7. Test on Android and with large text.
8. Open and review the PR, then merge after the preview is accepted.
9. Configure iOS internal-distribution credentials before producing a signed iOS preview with the `nehgz://` scheme.
10. Optional: Arabic captions or voiceover for the demo video.

## Files touched

New: `components/ui/*`, `features/hr/*` (incl. `screens/`, `errors.ts`, `error-state.tsx`, `demo-controls.tsx`), `app/(hub)/(tabs)/hr/*`, `app/hr-preview/*`, `app/activate.tsx`, `components/hub-merchant-gate.tsx`, `lib/navigation.ts`, `lib/hr-notifications.ts`, `lib/utils.ts`, 4 test files, `docs/demo/hr-attendance-demo.mp4`.

Changed: Hub layouts and tabs, More, Services, Staff, Dashboard, Bookings layout, pairing, login, root layout, app index, gateway select, WhatsApp profile, `tailwind.config.js`, `global.css`, `package.json`, `bun.lock`, `eas.json` (preview builds enable demo controls), `.claude/launch.json` (Expo dev server on port 8090).
