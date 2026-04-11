# WhatsApp CS — Mobile App Plan
**Production-Ready Expo Application**

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Screens & Features](#screens--features)
5. [Navigation Architecture](#navigation-architecture)
6. [Authentication](#authentication)
7. [Data Layer](#data-layer)
8. [Realtime & Push Notifications](#realtime--push-notifications)
9. [Stop Bot / Continue Bot](#stop-bot--continue-bot)
10. [Calendar & Reservations](#calendar--reservations)
11. [Supabase Changes Required](#supabase-changes-required)
12. [Backend Changes Required](#backend-changes-required)
13. [Environment & Configuration](#environment--configuration)
14. [EAS Build & Deployment](#eas-build--deployment)
15. [Production Checklist](#production-checklist)
16. [Implementation Phases](#implementation-phases)

---

## Overview

A companion mobile app for restaurant owners to manage their WhatsApp CS system on the go. Built with Expo, it connects to the same Supabase backend as the web dashboard. It is a **thin client** — all business logic remains in Supabase and the web backend. The app reads/writes data, receives push notifications, and lets owners take quick actions on orders and conversations.

**Target Platforms:** iOS + Android  
**Location in repo:** `/mobile/` inside the `/whatsapp-cs` monorepo  
**Supabase project:** Same project as web (shared auth, shared DB)

---

## Tech Stack

| Layer | Library | Version | Reason |
|-------|---------|---------|--------|
| Framework | `expo` | SDK 52 | Managed workflow, OTA updates, EAS |
| Language | TypeScript | 5.x | Matches web codebase |
| Navigation | `expo-router` | v4 | File-based routing, deep links, tabs |
| Styling | `nativewind` | v4 | Tailwind CSS on native, matches web |
| Auth + DB | `@supabase/supabase-js` | v2 | Same project as web |
| Session storage | `expo-secure-store` | latest | Secure token storage on device |
| Data fetching | `@tanstack/react-query` | v5 | Caching, background refresh, offline |
| State | `zustand` | v4 | Lightweight global state |
| Push notifications | `expo-notifications` | latest | Expo Push API, APNs, FCM |
| Calendar UI | `react-native-calendars` | latest | Monthly view with marked dates |
| Icons | `lucide-react-native` | latest | Matches web icon set |
| Forms | `react-hook-form` + `zod` | latest | Validated forms (login, etc.) |
| Date handling | `date-fns` | v3 | Consistent with potential web usage |
| Bottom sheets | `@gorhom/bottom-sheet` | v5 | Order/Conversation action panels |
| Toast / alerts | `react-native-toast-message` | latest | In-app notifications banner |
| Safe area | `react-native-safe-area-context` | latest | Notch/island handling |
| Gesture handler | `react-native-gesture-handler` | latest | Required by many Expo libs |
| Reanimated | `react-native-reanimated` | v3 | Animations (required by bottom sheet) |

---

## Project Structure

```
/mobile
├── app/                          ← Expo Router pages
│   ├── _layout.tsx               ← Root layout (providers, fonts)
│   ├── index.tsx                 ← Redirect to (auth) or (tabs)
│   ├── (auth)/
│   │   ├── _layout.tsx           ← Auth stack layout
│   │   ├── login.tsx             ← Email + password sign in
│   │   └── forgot-password.tsx   ← Password reset via email
│   ├── (tabs)/
│   │   ├── _layout.tsx           ← Bottom tab bar layout
│   │   ├── index.tsx             ← Home / Dashboard screen
│   │   ├── conversations.tsx     ← Conversations inbox list
│   │   ├── calendar.tsx          ← Reservations calendar
│   │   ├── orders.tsx            ← Orders & escalations list
│   │   └── settings.tsx          ← Restaurant & agent info
│   ├── conversations/
│   │   └── [id].tsx              ← Conversation thread detail
│   └── orders/
│       └── [id].tsx              ← Order detail + actions
│
├── components/
│   ├── ui/
│   │   ├── Badge.tsx             ← Status badge (pending/confirmed/etc.)
│   │   ├── MetricCard.tsx        ← Dashboard stat card
│   │   ├── Divider.tsx
│   │   └── LoadingSpinner.tsx
│   ├── ConversationCard.tsx      ← Inbox list row
│   ├── MessageBubble.tsx         ← Chat bubble (customer / agent)
│   ├── OrderCard.tsx             ← Order list row with badge
│   ├── BotToggle.tsx             ← Stop Bot / Continue Bot switch
│   ├── ReservationCard.tsx       ← Calendar day reservation row
│   ├── TabBarBadge.tsx           ← Red dot badge on tab icons
│   └── InAppBanner.tsx           ← Top banner for realtime alerts
│
├── hooks/
│   ├── useSession.ts             ← Supabase auth session
│   ├── useConversations.ts       ← Fetch + realtime conversations
│   ├── useConversationMessages.ts← Fetch messages for a thread
│   ├── useOrders.ts              ← Fetch + realtime orders
│   ├── useReservations.ts        ← Orders filtered by type=reservation
│   ├── useDashboardStats.ts      ← Home screen metrics
│   ├── useRestaurant.ts          ← Restaurant + agent info
│   ├── useBotToggle.ts           ← Stop/continue bot mutation
│   ├── useOrderAction.ts         ← Confirm/reject/reply mutation
│   └── usePushToken.ts           ← Register + store Expo push token
│
├── lib/
│   ├── supabase.ts               ← Supabase client (SecureStore adapter)
│   ├── queryClient.ts            ← React Query client config
│   ├── notifications.ts          ← Push registration + handlers
│   ├── constants.ts              ← App-wide constants
│   └── utils.ts                  ← Shared helpers (date format, etc.)
│
├── types/
│   └── database.ts               ← Copied/shared DB types from web project
│
├── assets/
│   ├── icon.png                  ← App icon (1024x1024)
│   ├── splash.png                ← Splash screen
│   ├── adaptive-icon.png         ← Android adaptive icon
│   └── sounds/
│       ├── new-order.wav         ← Notification sound
│       └── escalation.wav
│
├── app.json                      ← Expo config
├── eas.json                      ← EAS build profiles
├── babel.config.js
├── metro.config.js               ← NativeWind metro config
├── tailwind.config.js            ← NativeWind tailwind config
├── tsconfig.json
└── package.json
```

---

## Screens & Features

### 1. Login Screen (`/app/(auth)/login.tsx`)

- Email input + password input (secure text)
- "Sign In" button with loading state
- "Forgot password?" link → navigates to forgot-password screen
- Error display for invalid credentials
- Auto-redirect if session already exists (on app open)
- Uses Supabase `signInWithPassword()`
- Session stored in `expo-secure-store` (not AsyncStorage — more secure)

```
┌─────────────────────────┐
│                         │
│   🤖 WhatsApp CS        │
│                         │
│  ┌───────────────────┐  │
│  │ Email             │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ Password       👁 │  │
│  └───────────────────┘  │
│                         │
│  [ Sign In ]            │
│                         │
│  Forgot password?       │
└─────────────────────────┘
```

---

### 2. Forgot Password Screen (`/app/(auth)/forgot-password.tsx`)

- Email input
- Submit → calls `supabase.auth.resetPasswordForEmail()`
- Confirmation message shown after submit
- User receives reset link via email (handled by Supabase)

---

### 3. Home / Dashboard (`/app/(tabs)/index.tsx`)

**Metrics row (live via Realtime):**
- Active conversations count
- Pending orders count (with color — red if > 0)
- Agent status (Active / Paused)
- Readiness score %

**Agent card:**
- Agent name, personality, language, WhatsApp number

**WhatsApp status banner:**
- Green if active, yellow if pending, red if failed

**Recent conversations (last 5):**
- Customer name, last message preview, time ago
- Tap → goes to conversation detail

**Quick actions:**
- Buttons: "View Orders", "View Conversations", "Calendar"

**Pull-to-refresh** on entire screen.

---

### 4. Conversations Inbox (`/app/(tabs)/conversations.tsx`)

- Search bar (filters by customer name or phone)
- Filter chips: All / Open / Closed
- Sorted by latest message timestamp (newest first)
- Each row:
  - Customer name + phone number
  - Last message preview (truncated to 1 line)
  - Timestamp (relative: "2m ago", "Yesterday")
  - Unread dot (if last message is from customer and no agent reply yet)
  - Bot paused icon 🛑 if `bot_paused = true`
- Pull-to-refresh
- Infinite scroll (pagination: 20 per page)

---

### 5. Conversation Detail (`/app/conversations/[id].tsx`)

**Header:**
- Customer name + phone
- Back button
- **Stop Bot / Continue Bot toggle** (top-right)

**Message thread:**
- Scrollable list of messages
- Customer bubbles (left, gray)
- Agent/AI bubbles (right, brand color)
- System messages (centered, muted)
- Timestamps per message group
- Auto-scroll to bottom on open

**Bot paused banner:**
- Yellow banner at top when `bot_paused = true`: "Bot is paused for this conversation"

**Realtime:** New messages appear live via Supabase Realtime subscription on `messages` table filtered by `conversation_id`.

---

### 6. Orders List (`/app/(tabs)/orders.tsx`)

**Header badge:**
- Tab bar shows red badge with count of `status = 'pending'` orders

**Filter tabs:**
- All / Pending 🔴 / Confirmed ✅ / Rejected ❌ / Replied 💬

**Each order row:**
- Order type badge: `Reservation` (blue) / `Escalation` (orange)
- Customer name + phone
- Details preview (first line of `details` field)
- Timestamp
- Status badge

**In-app banner:** When a new order arrives while the app is open (Supabase Realtime), show a top banner: "New reservation from Ahmed" with a tap-to-view action.

**Pull-to-refresh + infinite scroll.**

---

### 7. Order Detail (`/app/orders/[id].tsx`)

**Info section:**
- Customer name, phone
- Order type (Reservation / Escalation)
- Current status badge
- Created at timestamp
- Full `details` text (what the AI extracted)

**Action buttons (only shown when `status = 'pending'`):**
- ✅ **Confirm** → sets status to `confirmed`, triggers WhatsApp confirmation message
- ❌ **Reject** → sets status to `rejected`, optional rejection reason input
- 💬 **Reply** → opens bottom sheet with text input to send custom WhatsApp message

**Status history:**
- Simple log: "Created → Pending → Confirmed by owner"

---

### 8. Calendar (`/app/(tabs)/calendar.tsx`)

**Monthly calendar view:**
- Uses `react-native-calendars`
- Days with reservations show a colored dot below the date number
- Dot colors: green = confirmed, orange = pending, red = rejected
- Tap a day → scrolls to that day's reservations in the list below

**Reservations list (below calendar):**
- Grouped by date (today, tomorrow, next week, etc.)
- Each row:
  - Time (extracted from `details` or `created_at`)
  - Customer name + phone
  - Party size / details
  - Status badge
  - Tap → goes to Order Detail
- Empty state: "No reservations on this day"

**Today's reservations** are highlighted at the top.

**Only shows `type = 'reservation'` orders** — escalations are excluded.

---

### 9. Settings (`/app/(tabs)/settings.tsx`)

**Restaurant section:**
- Name, country, currency
- Website URL, menu URL
- Setup status badge

**AI Agent section:**
- Agent name, personality, language
- System instructions (read-only, scrollable)
- WhatsApp number

**Account section:**
- Email address
- Change password (opens browser to Supabase hosted UI or in-app flow)
- **Logout** button → `supabase.auth.signOut()`, clears session, navigates to login

**App section:**
- App version
- Support contact

---

## Navigation Architecture

```
Root Layout (_layout.tsx)
│
├── (auth) Stack          ← shown when no session
│   ├── login
│   └── forgot-password
│
└── (tabs) Stack          ← shown when session exists
    ├── Tab: Home (index)
    ├── Tab: Conversations
    ├── Tab: Calendar
    ├── Tab: Orders  [badge: pending count]
    ├── Tab: Settings
    │
    ├── Stack: conversations/[id]    ← pushed from Conversations tab
    └── Stack: orders/[id]           ← pushed from Orders tab or Calendar
```

**Deep linking:**
- `whatsappcs://orders/[id]` — opened when user taps a push notification for a new order
- `whatsappcs://conversations/[id]` — opened from conversation notification
- Configure in `app.json` under `scheme`

---

## Authentication

### Flow

1. App opens → root layout checks Supabase session via `supabase.auth.getSession()`
2. If no session → redirect to `/(auth)/login`
3. If session exists → redirect to `/(tabs)`
4. On `signInWithPassword()` success → Supabase stores tokens → redirect to tabs
5. On logout → clear session → redirect to login
6. Token refresh: Supabase JS handles silently on every request

### Secure Storage Adapter

Supabase JS requires a storage adapter. On mobile we use `expo-secure-store` instead of `localStorage`:

```typescript
// lib/supabase.ts
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
```

### Auth Hook

```typescript
// hooks/useSession.ts
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    )

    return () => subscription.unsubscribe()
  }, [])

  return { session, loading }
}
```

---

## Data Layer

### React Query Setup

```typescript
// lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30s before refetch
      gcTime: 5 * 60_000,      // 5min cache retention
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
})
```

### Key Query Hooks

**Conversations:**
```typescript
// hooks/useConversations.ts
export function useConversations(filter?: 'open' | 'closed') {
  return useQuery({
    queryKey: ['conversations', filter],
    queryFn: async () => {
      const query = supabase
        .from('conversations')
        .select('*, messages(content, created_at, role)')
        .order('updated_at', { ascending: false })
        .limit(20)

      if (filter) query.eq('status', filter)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}
```

**Orders:**
```typescript
// hooks/useOrders.ts
export function useOrders(status?: OrderStatus) {
  return useQuery({
    queryKey: ['orders', status],
    queryFn: async () => {
      const query = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (status) query.eq('status', status)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}
```

**Dashboard stats:**
```typescript
// hooks/useDashboardStats.ts
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [convResult, ordersResult, agentResult] = await Promise.all([
        supabase.from('conversations').select('id, status', { count: 'exact' }).eq('status', 'open'),
        supabase.from('orders').select('id, status', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('ai_agents').select('name, language, is_active').single(),
      ])
      return {
        activeConversations: convResult.count ?? 0,
        pendingOrders: ordersResult.count ?? 0,
        agent: agentResult.data,
      }
    },
    refetchInterval: 60_000, // Refetch every 60s as fallback
  })
}
```

---

## Realtime & Push Notifications

### Supabase Realtime Subscriptions

Used for live updates while the app is in the foreground.

```typescript
// hooks/useOrders.ts (realtime addition)
useEffect(() => {
  const channel = supabase
    .channel('orders-changes')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'orders',
      filter: `restaurant_id=eq.${restaurantId}`,
    }, (payload) => {
      // Invalidate query to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      // Show in-app banner
      showBanner(`New ${payload.new.type} from ${payload.new.customer_name}`)
    })
    .subscribe()

  return () => supabase.removeChannel(channel)
}, [restaurantId])
```

### Push Notifications Setup

**Step 1: Register push token on login**

```typescript
// hooks/usePushToken.ts
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'

export async function registerPushToken(userId: string) {
  if (!Device.isDevice) return // Skip in emulator

  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return

  const token = (await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  })).data

  // Store token in Supabase profiles table
  await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', userId)
}
```

**Step 2: Configure notification behavior**

```typescript
// app/_layout.tsx
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})
```

**Step 3: Handle notification taps (deep link to order)**

```typescript
// app/_layout.tsx
const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
  const { orderId, conversationId } = response.notification.request.content.data

  if (orderId) router.push(`/orders/${orderId}`)
  if (conversationId) router.push(`/conversations/${conversationId}`)
})
```

**Step 4: Supabase Edge Function to send push on new order**

```typescript
// supabase/functions/notify-new-order/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const { record } = await req.json() // Postgres webhook payload

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Get restaurant owner's push token
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('owner_id')
    .eq('id', record.restaurant_id)
    .single()

  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', restaurant.owner_id)
    .single()

  if (!profile?.expo_push_token) return new Response('no token', { status: 200 })

  // Send via Expo Push API
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: profile.expo_push_token,
      title: record.type === 'reservation' ? '📅 New Reservation' : '⚠️ Escalation Alert',
      body: `${record.customer_name} — ${record.details?.substring(0, 80)}`,
      data: { orderId: record.id },
      sound: 'default',
      badge: 1,
    }),
  })

  return new Response('ok', { status: 200 })
})
```

**Step 5: Wire up the Edge Function as a Database Webhook**

In Supabase Dashboard → Database → Webhooks:
- Table: `orders`
- Event: `INSERT`
- URL: `https://<project>.supabase.co/functions/v1/notify-new-order`

---

## Stop Bot / Continue Bot

### How it works

1. Owner taps "Stop Bot" on a conversation detail screen
2. App calls mutation: `UPDATE conversations SET bot_paused = true WHERE id = ?`
3. The web app's AI reply job (currently in `src/lib/`) checks `bot_paused` **before** generating and sending a reply — if `true`, it skips
4. Owner taps "Continue Bot" → sets `bot_paused = false`, AI resumes

### UI Component

```typescript
// components/BotToggle.tsx
export function BotToggle({ conversationId, isPaused }: Props) {
  const mutation = useBotToggle(conversationId)

  return (
    <Pressable
      onPress={() => mutation.mutate(!isPaused)}
      className={`flex-row items-center gap-2 px-3 py-2 rounded-full ${
        isPaused ? 'bg-yellow-100' : 'bg-green-100'
      }`}
    >
      {isPaused ? (
        <>
          <PlayCircle size={16} color="#ca8a04" />
          <Text className="text-yellow-700 text-sm font-medium">Continue Bot</Text>
        </>
      ) : (
        <>
          <StopCircle size={16} color="#16a34a" />
          <Text className="text-green-700 text-sm font-medium">Stop Bot</Text>
        </>
      )}
    </Pressable>
  )
}
```

### Mutation Hook

```typescript
// hooks/useBotToggle.ts
export function useBotToggle(conversationId: string) {
  return useMutation({
    mutationFn: async (paused: boolean) => {
      const { error } = await supabase
        .from('conversations')
        .update({ bot_paused: paused })
        .eq('id', conversationId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}
```

---

## Calendar & Reservations

### Data Source

Queries `orders` table with:
- `type = 'reservation'`
- `restaurant_id = current restaurant`
- Date range: current month ± 1 month buffer

### Marked Dates for Calendar

```typescript
// hooks/useReservations.ts
export function useReservationMarkedDates() {
  const { data } = useReservations()

  return useMemo(() => {
    const marked: Record<string, MarkedDate> = {}
    data?.forEach(order => {
      const date = format(new Date(order.created_at), 'yyyy-MM-dd')
      const color = {
        pending: '#f97316',
        confirmed: '#22c55e',
        rejected: '#ef4444',
      }[order.status] ?? '#94a3b8'

      marked[date] = {
        marked: true,
        dotColor: color,
        dots: [...(marked[date]?.dots ?? []), { color }],
      }
    })
    return marked
  }, [data])
}
```

### Calendar Screen Layout

```
┌──────────────────────────────┐
│  ◀  April 2026           ▶  │
│  Mo Tu We Th Fr Sa Su        │
│  ..  1  2  3  4  5  6        │
│   7  8  9 10 11●12 13        │  ● = has reservations
│  14 15 16 17 18 19 20        │
│  21 22 23 24 25 26 27        │
│  28 29 30                    │
├──────────────────────────────┤
│  Friday, April 11            │
│  ┌────────────────────────┐  │
│  │ 🕐 7:00 PM             │  │
│  │ Ahmed Al-Rashidi       │  │
│  │ Party of 4             │  │
│  │           [Pending 🟠] │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │ 🕐 9:00 PM             │  │
│  │ Sara Mohammed          │  │
│  │ Anniversary dinner     │  │
│  │          [Confirmed ✅]│  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

---

## Supabase Changes Required

### 1. Add `bot_paused` to `conversations` table

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_bot_paused.sql
ALTER TABLE conversations
ADD COLUMN bot_paused BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN conversations.bot_paused IS
  'When true, AI agent will not auto-reply to this conversation. Set by mobile app owner.';
```

### 2. Add `expo_push_token` to `profiles` table

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_push_token.sql
ALTER TABLE profiles
ADD COLUMN expo_push_token TEXT;

COMMENT ON COLUMN profiles.expo_push_token IS
  'Expo push notification token registered from mobile app. Used to send push alerts.';
```

### 3. Enable Realtime on required tables

In Supabase Dashboard → Database → Replication, enable Realtime for:
- `conversations`
- `messages`
- `orders`

Or via SQL:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
```

### 4. Create Edge Function for push notifications

```
supabase/functions/notify-new-order/index.ts     ← New order/escalation push
supabase/functions/notify-new-conversation/index.ts ← New conversation push
```

Deploy with:
```bash
supabase functions deploy notify-new-order
supabase functions deploy notify-new-conversation
```

---

## Backend Changes Required

### 1. Check `bot_paused` in AI reply job

In the web app's AI reply logic (wherever it generates and sends a Twilio message), add a guard:

```typescript
// Before generating AI reply:
const { data: conversation } = await supabase
  .from('conversations')
  .select('bot_paused')
  .eq('id', conversationId)
  .single()

if (conversation?.bot_paused) {
  console.log(`[AI] Skipping reply — bot paused for conversation ${conversationId}`)
  return
}
```

### 2. Set badge count in push payload

Update the Edge Function to dynamically set the `badge` count to the current number of pending orders for that user, so the iOS badge always reflects the real count.

---

## Environment & Configuration

### `app.json` (Expo config)

```json
{
  "expo": {
    "name": "WhatsApp CS",
    "slug": "whatsapp-cs-mobile",
    "version": "1.0.0",
    "scheme": "whatsappcs",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "bundleIdentifier": "com.yourcompany.whatsappcs",
      "supportsTablet": false,
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    },
    "android": {
      "package": "com.yourcompany.whatsappcs",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#25D366",
          "sounds": ["./assets/sounds/new-order.wav"]
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "YOUR_EAS_PROJECT_ID"
      }
    }
  }
}
```

### `.env` file (inside `/mobile`)

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_PROJECT_ID=your-eas-project-id
```

> These are `EXPO_PUBLIC_` prefixed so Expo bundles them into the client. They are safe to include (anon key is public by design with RLS).

---

## EAS Build & Deployment

### Install EAS CLI

```bash
npm install -g eas-cli
eas login
eas init   # inside /mobile directory
```

### `eas.json` Build Profiles

```json
{
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true },
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "https://your-project.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-anon-key"
      }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "https://your-project.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-anon-key"
      }
    },
    "production": {
      "channel": "production",
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "https://your-project.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-anon-key"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@apple.id",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "appleTeamId": "YOUR_TEAM_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-key.json",
        "track": "production"
      }
    }
  }
}
```

### Build Commands

```bash
# Development build (local testing with dev client)
eas build --profile development --platform ios
eas build --profile development --platform android

# Preview build (share with testers via QR code)
eas build --profile preview --platform all

# Production build (App Store + Play Store)
eas build --profile production --platform all
```

### Submit to Stores

```bash
# Submit iOS to App Store Connect
eas submit --profile production --platform ios

# Submit Android to Google Play
eas submit --profile production --platform android
```

### OTA Updates (Over-the-Air)

For JS-only changes (no native code changes), use EAS Update — no App Store review required:

```bash
# Publish an update to the production channel
eas update --channel production --message "Fix orders filter bug"
```

Configure in `app.json`:
```json
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/YOUR_PROJECT_ID",
      "enabled": true,
      "checkAutomatically": "ON_LOAD"
    },
    "runtimeVersion": {
      "policy": "appVersion"
    }
  }
}
```

---

## Production Checklist

### Security
- [ ] Supabase Row Level Security (RLS) enforced on all tables — mobile uses same anon key, same policies
- [ ] `expo-secure-store` used (not AsyncStorage) for session tokens
- [ ] No service role key in mobile app — only anon key
- [ ] Deep link scheme validated to prevent open redirect attacks
- [ ] Push token stored per user in DB, not shared across users

### Performance
- [ ] React Query caching configured (30s stale, 5min gc)
- [ ] Realtime subscriptions scoped to `restaurant_id` filter (not listening to all rows)
- [ ] Images optimized and using `expo-image` (not stock `<Image>`)
- [ ] List virtualization with `FlashList` (not `FlatList`) for long lists
- [ ] Pagination on conversations and orders lists (20 items per page)

### Reliability
- [ ] Offline state handled — React Query shows cached data when no network
- [ ] Network error states shown (retry button on failed requests)
- [ ] Loading skeletons instead of spinners for list screens
- [ ] Pull-to-refresh on all list screens
- [ ] Notification permission handling — graceful fallback if denied

### UX & Accessibility
- [ ] RTL support (Arabic) — Expo Router + NativeWind support RTL
- [ ] Safe area insets handled on all screens
- [ ] Keyboard avoiding view on login and text input forms
- [ ] Haptic feedback on confirm/reject actions (`expo-haptics`)
- [ ] Empty states on all list screens

### Monitoring
- [ ] Sentry integration for crash reporting (`@sentry/react-native`)
- [ ] EAS Update rollback configured in case of bad update
- [ ] Supabase Edge Function logs monitored in dashboard

### App Store Requirements
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`) — required by Apple since 2024
- [ ] App Store screenshots at required sizes (6.7", 6.5", 5.5" for iOS)
- [ ] App icon at 1024x1024 (no alpha channel for iOS)
- [ ] `NSUserNotificationsUsageDescription` in `infoPlist`
- [ ] Google Play target API level ≥ 34 (Android 14)
- [ ] `google-services.json` added for FCM (Android push)

---

## Implementation Phases

### Phase 1 — Core (MVP, ~2 weeks)
- [ ] Project scaffold (Expo Router, NativeWind, Supabase, React Query)
- [ ] Auth screens (login, forgot password, session guard)
- [ ] Home / Dashboard screen with metrics
- [ ] Conversations inbox + thread detail
- [ ] Stop Bot / Continue Bot toggle
- [ ] Orders list + detail with confirm/reject actions
- [ ] Settings screen (view-only)
- [ ] Supabase migration: `bot_paused` column

### Phase 2 — Notifications & Calendar (~1 week)
- [ ] Calendar screen with marked dates and reservations list
- [ ] Expo push notification registration on login
- [ ] Supabase migration: `expo_push_token` column
- [ ] Edge Function: `notify-new-order`
- [ ] Edge Function: `notify-new-conversation`
- [ ] In-app banners via Supabase Realtime
- [ ] Tab bar badge on Orders tab

### Phase 3 — Polish & Production (~1 week)
- [ ] FlashList for performance on long lists
- [ ] Sentry crash reporting
- [ ] EAS Update (OTA) setup
- [ ] RTL / Arabic support testing
- [ ] App Store assets (icons, screenshots)
- [ ] Privacy manifest for iOS
- [ ] Submit to App Store + Google Play

### Phase 4 — Enhanced (Post-launch)
- [ ] Take-over mode — send manual WhatsApp reply from app
- [ ] Marketing campaign stats view
- [ ] Knowledge base quick-add from mobile
- [ ] Offline support with React Query persistence
- [ ] Biometric login (Face ID / Fingerprint) via `expo-local-authentication`

---

## Quick Start (When Ready to Build)

```bash
# 1. Create the Expo app inside the monorepo
cd /path/to/whatsapp-cs
npx create-expo-app mobile --template tabs
cd mobile

# 2. Install core dependencies
npx expo install expo-router expo-secure-store expo-notifications expo-haptics expo-image
npm install @supabase/supabase-js @tanstack/react-query zustand
npm install nativewind tailwindcss
npm install react-native-calendars @gorhom/bottom-sheet react-native-reanimated
npm install react-native-gesture-handler react-native-safe-area-context
npm install react-hook-form zod @hookform/resolvers
npm install lucide-react-native date-fns
npm install react-native-toast-message

# 3. Install EAS CLI and initialize
npm install -g eas-cli
eas login
eas init

# 4. Run on simulator
npx expo start
```

---

*Last updated: April 2026*
*Status: Planning phase*
