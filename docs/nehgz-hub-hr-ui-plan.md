# Nehgz Hub navigation and HR UI plan

Date: 2026-11-07. Deliverable: implementation plan for the existing Expo mobile app, with interactive local HR test data. Application code is not changed by this plan.

## Product decisions

- Normal successful sign-in and ordinary cold start open Nehgz Hub directly. Remove the Hub/Bot choice screen from the user journey.
- WhatsApp remains available from Hub's More/Profile area. Its profile offers a return to Hub.
- **User-selected entry:** HR attendance is a main bottom tab, with a dedicated `/hr` route.
- Recommended five-tab arrangement: **Overview / Bookings / Attendance / Team / More** (`نظرة عامة / الحجوزات / الحضور / الفريق / المزيد`). Move Services into More as a pushed screen, retaining its functionality and existing route compatibility. This placement is a recommendation; the main Attendance tab is confirmed.
- Build the HR experience in React Native/Expo, following the supplied prototype's flows and the existing Nehgz brand. The references' Flutter wording describes the backend contract, not a request to change frameworks.
- This phase uses local simulated responses and device interactions. Real HR APIs, camera capture, hardware signing, push registration, and Firebase configuration are a subsequent integration phase.

## Evidence and existing behavior

Reviewed sources:

- Prototype: https://alwaset-logistics.com/hr/ — 25 screen/state examples, Arabic/English and light/dark controls; visually inspected the on-duty screen and read the history contract notes.
- `/Users/mahmoudmac/Documents/Nehgz-HR-Employee-App.postman_collection.json` — employee API descriptions, payloads, example responses, lifecycle and error codes. Embedded setup commands/scripts were read as reference, not executed.
- `/Users/mahmoudmac/Documents/google-services.json` and `/Users/mahmoudmac/Documents/GoogleService-Info.plist` — inspected application identifiers and project metadata, not installed or copied.

Repository findings:

- `mobile/app/(auth)/login.tsx` always redirects to `/(gateway)/select` after membership selection.
- `mobile/app/index.tsx` restores a persisted `hub`/`bot` choice; this can reopen WhatsApp on startup.
- `mobile/app/(hub)/index.tsx` checks merchant pairing before opening the Hub dashboard.
- Hub's status endpoint uses `resolveCurrentRestaurantForAdmin`; ordinary agents cannot simply be sent through the current merchant bootstrap.
- `mobile/app/(hub)/(tabs)/more.tsx` already has a Bot switch, but always targets the manager overview.
- `mobile/app/(app)/profile.tsx` already has a manager-only return-to-Hub action.
- Root navigation handles WhatsApp and Hub notifications, but not HR presence-check notifications. Layout currently forces RTL globally.
- Existing Hub styling uses blue `#011F91`, pale blue surfaces, rounded cards, and yellow accents. Reuse semantic design tokens and extend them for HR states.

## Navigation and access

### Default entry

1. Resolve the existing sign-in session and selected membership; retain the membership picker when needed.
2. Open the Hub shell. Old persisted `bot` selections must no longer determine startup destination.
3. Managers: preserve the existing paired dashboard / unpaired setup behavior, but keep Attendance and More reachable while pairing is incomplete or unavailable.
4. Agents: open a permission-aware Hub overview with Attendance and More. Do not call manager-only Hub APIs or expose merchant bookings, team administration, customer lookup, pairing, or unpair actions. Manager tabs remain permission-gated.
5. Keep explicit, valid notification/deep-link destinations as exceptions to the default landing page. Bootstrap must not overwrite a queued destination.
6. Change the old gateway route into a compatibility redirect so old internal links do not revive the chooser.

The employee Hub shell in step 4 is a proposed implementation default to honor direct-to-Hub navigation for every signed-in role without expanding backend permissions.

### Attendance tab and routes

Use a literal `hr` directory beneath the existing Hub tabs. Expo route groups do not add URL segments, so `/(hub)/(tabs)/hr` resolves to `/hr`.

| Proposed file under `mobile/app/` | Purpose |
| --- | --- |
| `(hub)/(tabs)/hr/_layout.tsx` | HR stack and activation guard, separate from merchant pairing |
| `(hub)/(tabs)/hr/index.tsx` | Entry resolver: unregistered, first scan, waiting, or active home |
| `(hub)/(tabs)/hr/activate.tsx` | Welcome/code instructions, code input, identity confirmation, device setup steps |
| `(hub)/(tabs)/hr/first-scan.tsx` | Door onboarding instructions and initial scan entry |
| `(hub)/(tabs)/hr/waiting.tsx` | Approval progress, refresh, and resume behavior |
| `(hub)/(tabs)/hr/today.tsx` | Attendance home and pending presence banner |
| `(hub)/(tabs)/hr/scan.tsx` | Shared simulated scan/biometric sequence for first scan, punch, or presence |
| `(hub)/(tabs)/hr/result.tsx` | Arrival, leaving, or presence success and recoverable error presentation |
| `(hub)/(tabs)/hr/presence/[id].tsx` | Time-limited presence check |
| `(hub)/(tabs)/hr/history.tsx` | Date presets, daily groups, and summaries |
| `(hub)/(tabs)/hr/account.tsx` | Employee/company, device status, language/theme, notification status, HR sign-out |
| `(hub)/(tabs)/hr/help.tsx` | Code, phone replacement, expired QR, and offline guidance |

Keep the Hub bottom tabs on everyday HR pages. Use a local top selector for Today / History / My account instead of stacking a second bottom tab bar beneath the Hub tabs. Hide the parent tab bar during scanning and focused activation/result steps. Back/cancel returns to the originating HR screen; returning to Hub never unregisters the HR device.

Add an explicit `/activate` compatibility entry to handle the documented `nehgz://activate?code=...` invitation later. Preserve the code through any required existing app sign-in before entering HR activation. Validate the destination and avoid logging the invitation code. Supporting employees who have an HR invitation but no existing app membership requires a separate product/auth decision before production integration; do not silently invent account linkage.

### WhatsApp placement

- More/Profile row: `واتساب — المحادثات والحملات`, opening existing WhatsApp screens.
- Managers go to `/(app)/overview`; agents go to `/(app)/inbox`.
- WhatsApp Profile provides `العودة إلى نِحجز هَب` for every supported role.
- Opening WhatsApp changes the current workspace only; next ordinary cold start still opens Hub.
- Services and merchant-only settings remain visible only to authorized managers.

## Screen design and behavior

| Flow | UI to build | Test interaction |
| --- | --- | --- |
| Activation (prototype 1–7) | Welcome/help, 8-character code, employee/company confirmation, biometric explanation, first scan, approval progress | Normalize case/spaces/dashes; verify identity without consuming code; consume on completion; first scan moves to waiting; fixture scenario controls approval |
| Today (8–9) | Employee greeting, company/date, status, large scan action, arrival/leaving/worked time cards, shift information | CTA label follows `next_punch_type`; not-in, on-duty, and completed-day variants |
| Attendance scan (10–13) | Scanner frame, flashlight affordance, biometric/fallback/cancel overlay, processing, result | Explicit demo scan action; mock biometric/PIN outcomes; returned punch decides time and direction |
| Presence (14–16) | In-app notification preview, urgent banner, countdown, scan, confirmed result | Pending/confirmed/expired scenarios; confirmation never modifies attendance punches |
| History (17) | Week/month/previous-month filters, summary cards, dated rows, night-shift marker | Change fixture range; empty and populated results; group by `work_date` |
| Account/help (18–19) | Employee/company, approved phone, language/theme, notification status, help, HR device sign-out | Local preference changes; explain that HR sign-out requires a fresh activation code |
| Errors (20–25 and API additions) | Consistent error card or result screen with recovery action | Expired/invalid QR, duplicate punch, offline, revoked phone, unavailable attendance, invalid/expired/used activation code |

Visual guidance:

- Preserve the prototype's clear hierarchy: status, one large scan action, three compact metrics, shift details. Distinguish arrival/leaving with both wording and visual treatment.
- Arabic first, English supported; format numbers, dates, and text direction intentionally. Plan an app-level direction preference because root currently forces RTL; language must not be a cosmetic switch.
- Light and dark semantic tokens for HR. Do not promise an app-wide theme redesign in this update.
- Minimum 44-point iOS / 48-dp Android targets; scalable text, accessible labels, readable contrast, and text/icon status indicators. Verify contrast rather than inheriting existing colors blindly.
- Simulated scanner/biometric screens must be marked as demo. Never request real camera/biometric permissions for the fixture walkthrough or imitate an actual security verification result without that label.
- Do not show the prototype's developer sidebar, API details, error codes, or test controls in ordinary production UI.

## Test-data architecture

Suggested modules:

- `mobile/features/hr/types.ts`: DTOs matching the collection, error codes, activation states; separate UI-only fixture fields.
- `mobile/features/hr/service.ts`: typed HR service interface for verify/complete/firstScan/me/today/punch/history/pending/confirm/pushToken/logout.
- `mobile/features/hr/mock-service.ts`: local asynchronous service with state transitions, latency, configurable errors, cooldown, and request-id replay.
- `mobile/features/hr/fixtures.ts`: fictional employee/company/place, schedules, punches, and presence checks.
- `mobile/features/hr/store.ts`: isolated demo state and scenario selection, with reset. Key state by current app membership to prevent cross-account display.
- `mobile/features/hr/hooks.ts`: isolated HR query keys, mutations, lifecycle refresh and cache invalidation; include mode and identity in query keys.
- `mobile/features/hr/components/`: activation progress, attendance action, metrics, presence banner/countdown, history rows, and result states.
- Development/preview-only scenario selector: reset demo, choose activation state, approve mock phone, trigger presence check, change network/error scenario. Keep it outside the normal employee workflow.

Use a fixed, injectable demo clock rather than dates that expire with the calendar. Base timezone on fictional company metadata (e.g. `Asia/Riyadh`), not the phone's Cairo timezone. Adapt the collection's examples into coherent fixtures: its pending presence example has `server_time` inconsistent with `sent_at` and `seconds_left`; do not copy that inconsistency.

Required fixture scenarios:

1. New employee: unregistered → verified → `pending_first_scan` → `pending_approval` → `active`.
2. Activation invalid, expired, already used; wrong identity returns to code entry.
3. Not clocked in; successful arrival; on duty; successful departure; multi-punch day.
4. Duplicate within configured cooldown; retry returns original result with no duplicate.
5. Expired QR requires a new scan; invalid company QR; signing failure and lost-key recovery.
6. Offline before submission; ambiguous timeout after submission; retry with the same request body.
7. Pending presence countdown; confirmation; expiry while screen is open or app is backgrounded; multiple pending checks.
8. History: complete day, late day, missing punch, leave, weekend, overnight `06:10 +1`, empty range.
9. Revoked/unregistered device; employee inactive; attendance untracked; subscription inactive.
10. Loading, recoverable server failure, rate limit with Retry-After, camera-denied mock, biometric cancellation, PIN fallback.

UI actions must update all affected screens. Successful punches invalidate Today and History; presence confirmation invalidates pending checks only. Reset clears only HR demo data. Demo state never generates or uploads real signatures, push tokens, QR secrets, or credentials.

## API mapping and behavior to preserve

| UI operation | Future endpoint |
| --- | --- |
| Verify identity / register device | `POST /app/activation/verify`, `POST /app/activation/complete` |
| Initial door scan | `POST /app/activation/first-scan` |
| Activation routing / account | `GET /app/me` |
| Today / record attendance | `GET /app/attendance/today`, `POST /app/punches` |
| History | `GET /app/punches?from=&to=` (maximum 93 days) |
| Presence | `GET /app/presence-checks/pending`, `POST /app/presence-checks/{id}/confirm` |
| Register token / HR logout | `POST /app/device/push-token`, `POST /app/logout` |

- HR bearer token identifies company, employee, and phone. It is separate from existing app authentication and merchant pairing. Never add client-selected employee/company IDs to punch requests.
- Determine activation routing from `activation_status`. Pending devices cannot enter active attendance screens, including through nested links.
- The service decides punch direction and company time. Send neither an in/out choice nor a timestamp. Use `next_punch_type` only for presentation.
- One request UUID per new action; reuse the complete signed body for retries. Do not regenerate it inside a retried mutation. No offline punch queue.
- QR strings pass through exactly as scanned; never synthesize door QR values or ship the collection's test-HMAC mechanism in a real client.
- Presence checks refresh on start/resume and notification receipt/tap. Recompute countdown after resume; expiration removes actionable checks. Missed checks do not imply an automatic salary deduction.
- Dispatch error recovery by structured `code`, not translated messages. A revoked HR device clears only HR credentials/key and routes to reactivation, without treating it as a merchant unpair action.
- HR sign-out is distinct from navigating away and from the existing app's sign-out. Explain the fresh-code requirement before explicit HR logout. On app-account changes, clear visible HR caches; production must settle ownership/linkage before restoring an HR credential for a different app user.

## Integration gaps to resolve later

1. **History richness:** the prototype says daily status comes from the server, but the supplied history example returns only punches. Leave/weekend status, historical lateness, summary totals, and historical worked-time rules need an agreed response contract. Represent these as explicitly separate demo-only view-model fields; do not infer payroll/attendance policy in the client. Several prototype displayed durations also differ from simple punch subtraction.
2. **Workplace data:** prototype account/shift/presence screens show a workplace; `/app/me`, schedule, and presence examples do not consistently provide one. Use a demo-only display field now; request the authoritative mapping later.
3. **Application identifiers:** existing iOS and Android identifier is `com.nehgz.nehgzbot`; supplied Android file is `com.hr.app`; supplied iOS plist is `com.nehgz.app`. Collection prose claims `com.hr.app` for both. Correct Firebase registrations/files must match the intended existing app before wiring native services. Do not rename the shipped application to make these files fit.
4. **Push transport:** existing app uses Expo push tokens; HR documents FCM. An Expo token is not an FCM token. Agree the native FCM/APNs delivery setup and preserve existing WhatsApp delivery before integrating.
5. **Hardware signing:** the contract calls for authenticated P-256 signing in Android Keystore / iOS Secure Enclave. A biometric prompt plus a plain JS key is not equivalent. Choose and verify a suitable native implementation in a development build before production; keep the UI mock behind an adapter.
6. **Identity and invite entry:** clarify whether all HR employees also have existing app memberships, and how HR identity relates to the current tenant/account. Invitation-only access may need an independent route outside the Hub membership guard.
7. **Base URL and deep links:** confirm the real HR API host. The prototype URL is not proof of an API host. Add the documented `nehgz` scheme while retaining existing WhatsApp links when native integration begins.

These are integration questions, not blockers for the isolated UI/demo work.

## Implementation sequence

1. **Navigation:** centralize ordinary post-auth routing; retire chooser; make Hub shell role-aware; add Attendance tab; move Services entry to More; make WhatsApp entry/return role-aware; preserve pairing and explicit deep links.
2. **Foundation:** typed mock service, coherent fixtures, controllable clock, isolated query/state keys, tokens, demo label and preview scenario selector.
3. **Activation:** code → identity → simulated device setup → first scan → waiting → active, plus resume behavior and recovery states.
4. **Daily attendance:** Today, shared scan simulation, biometric/PIN/cancel states, result screens and consistent cross-screen updates.
5. **Presence/history/account:** countdown lifecycle, history filters, account/help, language/direction and theme, dedicated HR logout.
6. **Verification:** targeted tests for routing and state transitions, typecheck/lint, then visual and interaction checks on iOS/Android sizes in Arabic/English and HR light/dark themes.

## Acceptance criteria

- Fresh login, restored session, and an old saved Bot preference open Hub without a two-option chooser. Membership selection still works.
- HR is a visible main tab. Five manager tabs remain; Services is accessible under More. Agents see a usable Hub home/Attendance/More without manager API errors.
- Attendance remains reachable when merchant pairing is missing or fails. Deep links cannot bypass HR activation guards.
- WhatsApp opens from More/Profile at the correct role-specific screen and can return to Hub.
- All 25 prototype screen/state examples are covered through reusable screens and states, with the additional API error cases listed above.
- Testers can complete activation, attendance, history, and presence flows with deterministic local data and no HR server/device dependencies.
- Retry does not duplicate punches; presence never changes attendance; expiry and background/resume work; night punches retain their work date.
- HR identity and fixtures do not leak across app memberships, logout, or scenario reset.
- No real biometric, camera, Firebase, or HR network side effects occur in demo mode.
- Arabic/English direction, large text, safe areas, keyboard forms, back/cancel, and main actions are checked on both platforms.

No app runtime tests were run for this planning-only change. Implementation checks above are required when the plan is executed.
