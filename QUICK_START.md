# WhatsApp AI Dashboard - Quick Start Guide

## 5-Minute Setup

### 1. Install & Run
```bash
npm install
npm run dev
```
Visit `http://localhost:3000`

### 2. Create .env.local
Copy from `.env.example` and fill in your Supabase credentials:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://nkdkqgrkyqpjdaifazwn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
```

### 3. Sign Up
- Click "Sign up" on the login page
- Enter email and password
- Complete the 4-step onboarding

### 4. Explore Dashboard
Navigate through:
- **Overview**: Dashboard stats and recent conversations
- **Restaurant**: Configure your restaurant details
- **AI Agent**: Set personality and system instructions
- **Knowledge Base**: Add FAQ and policies
- **Menu**: Manage menu items
- **Conversations**: View customer chats
- **Marketing**: Create campaigns and templates

## File Structure Overview

```
✅ Authentication
  src/app/(auth)/login/page.tsx
  src/app/(auth)/signup/page.tsx
  src/lib/supabase/client.ts
  src/middleware.ts

✅ Onboarding
  src/app/(onboarding)/onboarding/page.tsx

✅ Dashboard
  src/app/(dashboard)/layout.tsx
  src/app/(dashboard)/dashboard/page.tsx

✅ Restaurant Management
  src/app/(dashboard)/dashboard/restaurant/page.tsx

✅ AI Agent Config
  src/app/(dashboard)/dashboard/ai-agent/page.tsx

✅ Knowledge Base
  src/app/(dashboard)/dashboard/knowledge-base/page.tsx

✅ Menu Management
  src/app/(dashboard)/dashboard/menu/page.tsx

✅ Conversations
  src/app/(dashboard)/dashboard/conversations/page.tsx

✅ Marketing
  src/app/(dashboard)/dashboard/marketing/page.tsx
  src/app/(dashboard)/dashboard/marketing/templates/page.tsx
  src/app/(dashboard)/dashboard/marketing/campaigns/page.tsx

✅ UI Components
  src/components/ui/button.tsx
  src/components/ui/input.tsx
  src/components/ui/card.tsx
  src/components/ui/badge.tsx
  src/components/ui/textarea.tsx
  src/components/ui/select.tsx
  src/components/ui/tabs.tsx
  src/components/ui/avatar.tsx
  src/components/ui/sidebar.tsx
  src/components/ui/stats-card.tsx
```

## Key Features

### 🔐 Authentication
- Email/Password signup and login
- Google OAuth integration
- Secure session management
- Protected routes

### 📱 Onboarding
- 4-step wizard with progress tracking
- Restaurant info collection
- AI personality selection
- WhatsApp setup instructions
- Menu import option

### 📊 Dashboard
- Real-time statistics
- Recent conversations list
- AI agent status
- Top questions tracker
- Quick action buttons

### 🏪 Restaurant Settings
- Basic information editor
- Contact details management
- Location and currency settings
- Operating hours configuration

### 🤖 AI Agent Configuration
- 4 personality styles (Friendly, Professional, Creative, Strict)
- System instructions editor
- Language preferences
- Temperature/creativity control
- Live preview panel

### 📚 Knowledge Base
- Add/edit/delete entries
- Category management
- Token usage tracking
- Quick widget for adding entries

### 🍽️ Menu Management
- Add/edit/delete menu items
- Category filtering
- Availability toggle
- Web crawler for auto-import
- Price management

### 💬 Conversations
- Live conversation viewer
- Customer search
- Message history
- Reply interface
- Status tracking

### 📢 Marketing
- Campaign management
- WhatsApp template builder
- CSV customer import
- Response analytics
- Pre-built templates
- Multi-step campaigns

## Component Examples

### Using Button Component
```tsx
import { Button } from "@/components/ui/button";

<Button variant="default">Save</Button>
<Button variant="outline">Cancel</Button>
<Button disabled>Loading...</Button>
```

### Using Card Component
```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>Settings</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Your content */}
  </CardContent>
</Card>
```

### Using Input Component
```tsx
import { Input } from "@/components/ui/input";

<Input
  type="email"
  placeholder="you@example.com"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>
```

### Using Sidebar
```tsx
import { Sidebar } from "@/components/ui/sidebar";

<Sidebar
  restaurantName="My Restaurant"
  userName="John Doe"
  userEmail="john@example.com"
  onLogout={handleLogout}
/>
```

## Common Tasks

### Add a New Knowledge Entry
1. Go to "Knowledge Base"
2. Fill in Title and Content
3. Select Category
4. Click "Add Entry"

### Create a Marketing Campaign
1. Go to "Marketing" → "Campaigns"
2. Click "New Campaign"
3. Fill in campaign name and message
4. Upload CSV with customer phone numbers
5. Click "Create Draft"
6. Click "Send Now" to send immediately

### Configure AI Agent
1. Go to "AI Agent"
2. Select personality style
3. Edit system instructions
4. Adjust temperature slider
5. Click "Save Configuration"

### Manage Menu Items
1. Go to "Menu"
2. Click "Add Item"
3. Fill in name, description, price
4. Select category
5. Toggle "Available"
6. Click "Add Item"

## Styling with Tailwind CSS

All components use Tailwind CSS classes for styling:

```tsx
<div className="p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
  <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
    Title
  </h1>
</div>
```

Dark mode is automatically handled via `next-themes`.

## Environment Variables

Required:
```env
NEXT_PUBLIC_SUPABASE_URL=https://nkdkqgrkyqpjdaifazwn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

Optional:
```env
SUPABASE_SERVICE_ROLE_KEY=your_service_key
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=your_number
GOOGLE_API_KEY=your_api_key
```

## Useful Commands

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Type checking
npx tsc --noEmit
```

## Folder Structure Guide

```
src/
├── app/                    # Next.js App Router
├── components/ui/          # Reusable UI components
├── lib/
│   ├── utils.ts           # Utility functions (cn)
│   └── supabase/          # Supabase clients and middleware
└── middleware.ts          # Auth middleware
```

## Common Issues & Solutions

### Issue: 404 on protected routes
**Solution**: Make sure user is authenticated. Middleware will redirect to login if not.

### Issue: Supabase connection error
**Solution**: Check `.env.local` has correct URL and anon key from your Supabase project.

### Issue: Styles not applying
**Solution**: Clear `.next` folder and rebuild: `rm -rf .next && npm run dev`

### Issue: Dark mode not working
**Solution**: Check that `ThemeProvider` is in `layout.tsx` and `html` tag has `suppressHydrationWarning`.

## Next Steps

1. ✅ Configure Supabase Auth (Google OAuth)
2. ✅ Set up database tables
3. ✅ Connect Twilio for WhatsApp
4. ✅ Customize styling/branding
5. ✅ Add more features
6. ✅ Deploy to production

## Deployment

### Vercel (Recommended)
```bash
npm install -g vercel
vercel
```

### Self-hosted
```bash
npm run build
npm start
```

## Support

See `DASHBOARD_SETUP.md` for comprehensive documentation.

---

**Happy building! 🚀**
