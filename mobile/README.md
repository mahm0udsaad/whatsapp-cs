# Agent Console (mobile)

Companion Expo client for tenant **agents** (team_members with `role='agent'` or
`'admin'`) of the WhatsApp CS platform. Owners use the web dashboard; this app
is optimized around a single loop: **claim an unclaimed escalation, read the
thread, send a reply**. Arabic-first, RTL, push notifications, realtime inbox.

> Part of the `whatsapp-cs` monorepo — shares Supabase with the web app.

## Getting started

```bash
cd mobile
npm install
cp .env.example .env     # fill in values (see below)
npx expo start
```

Open the dev client on an iOS simulator (`i`), Android emulator (`a`), or a
physical device via Expo Go / the custom dev client.

### Environment

Mobile-only env vars; they are **public** (bundled into the client) — keep
the service-role key strictly on the Next.js backend.

| Var | Example | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<proj>.supabase.co` | Supabase URL (shared with web) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Anon key (RLS-enforced) |
| `EXPO_PUBLIC_APP_BASE_URL` | `http://localhost:3000` | Next.js backend base URL for `/api/*` fetches |

## EAS builds

```bash
# one-time: eas login && eas init
eas build -p ios     --profile development
eas build -p android --profile development
eas build -p all     --profile preview
eas build -p all     --profile production
```

To create an Expo-hosted Android APK install page for testers:

```bash
bun run build:android:preview:cloud
```

This starts the `preview` Android APK build on EAS and prints a build URL. When
the build finishes, open that URL on an Android device to see the install /
download button.

For a local Android EAS build on macOS, run the project script so Gradle can
find the Android SDK:

```bash
bun run build:android:preview:local
```

The script defaults `ANDROID_HOME` and `ANDROID_SDK_ROOT` to
`$HOME/Library/Android/sdk`, which is the standard Android Studio SDK location.
It also sets Java/Gradle network options used by the local release build. If
your SDK is installed somewhere else, export both variables before running the
script.

Profiles in `eas.json`:
- `development` — dev client, internal distribution, iOS simulator enabled.
- `preview` — internal distribution against the staging backend.
- `production` — store-bound, production backend.

## Push setup

1. **iOS** — requires an Apple Push Notifications cert. Let EAS manage it:
   `eas credentials` → iOS → Push Notifications key.
2. **Android** — add your Firebase project's `google-services.json` at
   `mobile/google-services.json` and set an FCM V1 server key in the EAS
   credentials UI.
3. On login the app requests notification permission, fetches its Expo push
   token via `expo-notifications`, and POSTs it to
   `${EXPO_PUBLIC_APP_BASE_URL}/api/mobile/push-token` — no further action
   needed client-side.

The `escalations` Android channel and the iOS `escalations` category are
declared in `app.json`.

## Deep links

App scheme: **`whatsapp-cs-agent://`**

- `whatsapp-cs-agent://inbox` — unclaimed queue
- `whatsapp-cs-agent://inbox/<orderId>` — thread inspector

Push notifications with `data.orderId` route to `/inbox/<orderId>` via the
handler wired in `app/_layout.tsx`.

## Backend endpoints consumed

All hosted under the Next.js project (`src/app/api/`):

| Method / path | Purpose |
| --- | --- |
| `POST /api/orders/:id/claim` | Atomic claim (existing) |
| `POST /api/dashboard/inbox/:id/send` | Send agent reply (existing) |
| `GET  /api/mobile/conversations/:id` or `…/by-order/:orderId` | Tenant-scoped read |
| `PATCH /api/mobile/availability` | Flip `team_members.is_available` |
| `POST /api/mobile/push-token` | Register / refresh Expo token (existing) |
| `POST /api/mobile/push-token/disable` | Soft-disable on logout |

## Project layout

```
app/
  _layout.tsx           Providers, RTL, push handler
  index.tsx             Auth bootstrap + redirect
  (auth)/login.tsx      Email/password + tenant picker
  (app)/_layout.tsx     Tab bar (Inbox / Shifts / Profile)
  (app)/inbox/          Unclaimed queue + thread inspector
  (app)/shifts.tsx      Agent's own upcoming shifts
  (app)/profile.tsx     Availability toggle + logout
lib/
  supabase.ts           Supabase client with SecureStore adapter
  auth.ts               Login / logout / membership helpers
  api.ts                Fetch wrappers for claim / send / conversation / availability
  push.ts               registerForPushNotificationsAsync + disable
  realtime.ts           postgres_changes subscriptions
  session-store.ts      Zustand active-tenant store, device id
  query-keys.ts         React Query keys
```
