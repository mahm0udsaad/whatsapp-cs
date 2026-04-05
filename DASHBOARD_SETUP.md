# WhatsApp AI Customer Service Dashboard - Complete Setup Guide

## Project Overview

A modern, production-ready Next.js 16 dashboard for managing restaurant WhatsApp AI customer service agents. Built with TypeScript, Tailwind CSS, and Supabase for multi-tenant restaurant management.

## ✨ Features

### 1. **Authentication & Authorization**
- Email/password authentication via Supabase
- Google OAuth integration
- Role-based access control
- Protected routes with middleware
- Session management

### 2. **Onboarding Flow**
- 4-step guided setup wizard
- Restaurant information collection (name, country, currency)
- AI agent personality configuration (Friendly, Professional, Creative, Strict)
- WhatsApp Twilio integration setup
- Digital menu import (optional)
- Progress indicators and smooth animations

### 3. **Dashboard Overview**
- Real-time statistics cards (conversations, messages, response rate)
- Recent conversations list
- AI agent status panel
- Top questions tracker
- Quick navigation links

### 4. **Restaurant Management**
- Restaurant details editor (name, description, cuisine type)
- Contact information management
- Operating hours configuration
- Location and currency settings
- Restaurant preview panel

### 5. **AI Agent Configuration**
- Agent personality selection with visual cards
- System instructions editor
- Language preferences (English, Arabic, Bilingual)
- Temperature/creativity slider
- Live preview of agent responses
- Configuration summary

### 6. **Knowledge Base Manager**
- Add/edit/delete knowledge entries
- Categorization system (Policies, Menu, Hours, Payments, General)
- Search and filter capabilities
- Token usage statistics
- Quick knowledge entry widget

### 7. **Menu Management**
- Menu item viewer and editor
- Category filtering (Main Course, Starters, Desserts, etc.)
- Availability toggle
- Price management with currency
- Menu web crawler (auto-import from website)
- Draft/published states

### 8. **Conversations**
- Live conversation viewer
- Customer interaction history
- Real-time message display
- Search by customer name/phone
- Reply interface
- Conversation status tracking

### 9. **Marketing Module**
- Campaign manager with draft/scheduled/sent states
- WhatsApp template builder with variable support
- CSV customer list import
- Response rate analytics
- Pre-built campaign templates
- Multi-language template support

## 🗂️ Project Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx          # Auth centered card layout
│   │   ├── login/page.tsx      # Email/password + Google OAuth
│   │   └── signup/page.tsx     # Registration page
│   ├── (onboarding)/
│   │   └── onboarding/page.tsx # 4-step wizard
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Dashboard with RTL-aware sidebar
│   │   └── dashboard/
│   │       ├── page.tsx        # Overview dashboard
│   │       ├── restaurant/page.tsx
│   │       ├── ai-agent/page.tsx
│   │       ├── knowledge-base/page.tsx
│   │       ├── menu/page.tsx
│   │       ├── conversations/page.tsx
│   │       └── marketing/
│   │           ├── page.tsx
│   │           ├── templates/page.tsx
│   │           └── campaigns/page.tsx
│   ├── auth/callback/route.ts  # OAuth callback handler
│   ├── layout.tsx              # Root layout with theme provider
│   ├── page.tsx                # Landing/redirect page
│   └── globals.css
├── components/
│   └── ui/
│       ├── button.tsx
│       ├── input.tsx
│       ├── card.tsx
│       ├── badge.tsx
│       ├── textarea.tsx
│       ├── select.tsx
│       ├── tabs.tsx
│       ├── avatar.tsx
│       ├── sidebar.tsx         # RTL-aware navigation sidebar
│       └── stats-card.tsx      # Dashboard stats component
├── lib/
│   ├── utils.ts                # cn() classname utility
│   └── supabase/
│       ├── client.ts           # Browser client
│       ├── server.ts           # Server client
│       └── middleware.ts       # Auth middleware
└── middleware.ts               # Next.js middleware

```

## 🚀 Installation & Setup

### Prerequisites
- Node.js 18+
- npm/yarn/pnpm
- Supabase project (nkdkqgrkyqpjdaifazwn in eu-central-1)

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://nkdkqgrkyqpjdaifazwn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### 3. Run Development Server
```bash
npm run dev
```

Visit `http://localhost:3000`

### 4. Build for Production
```bash
npm run build
npm start
```

## 🎨 Design System

### Colors
- **Primary**: Emerald/Green (WhatsApp branding) - `emerald-500`, `emerald-600`
- **Background**: White (light) / `gray-950` (dark)
- **Text**: `gray-900` (light) / `gray-50` (dark)
- **Borders**: `gray-200` (light) / `gray-800` (dark)

### Typography
- **Fonts**:
  - Inter (English)
  - Noto Sans Arabic (Arabic)
- **Sizes**: text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, text-3xl
- **Weights**: font-medium, font-semibold, font-bold

### Components
All components support:
- Dark mode via `next-themes`
- Tailwind CSS styling
- TypeScript types
- Accessibility standards

## 🔐 Authentication Flow

```
User visits /
  ↓
Check if authenticated
  ├─ Yes → Redirect to /dashboard
  └─ No → Redirect to /login

/login or /signup
  ├─ Email/Password auth
  └─ Google OAuth

After auth:
  ├─ New user → /onboarding
  └─ Existing user → /dashboard
```

## 🌍 RTL Support (Arabic)

The dashboard is built with RTL-first design:
- Sidebar responsive on mobile
- Text direction auto-adjusts
- All icons and layouts support both LTR and RTL
- Language switching capability

## 📱 Responsive Design

- **Mobile**: Single column, hamburger sidebar
- **Tablet**: 2-column layout
- **Desktop**: Full 3-column layout

## 🛠️ Key Technologies

| Tech | Purpose |
|------|---------|
| **Next.js 16** | React framework with SSR |
| **TypeScript** | Type safety |
| **Tailwind CSS 4** | Styling |
| **Supabase** | Auth + Database |
| **React Hooks** | State management |
| **Radix UI** | Accessible components |
| **Lucide React** | Icons |
| **next-themes** | Dark mode support |
| **Cheerio** | HTML parsing (menu crawling) |
| **Twilio SDK** | WhatsApp integration |
| **XLSX** | Excel file handling |
| **Google Generative AI** | AI capabilities |

## 📚 Component Examples

### Button
```tsx
<Button variant="default" size="lg">Save</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">Delete</Button>
```

### Card
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content here</CardContent>
</Card>
```

### Stats Card
```tsx
<StatsCard
  title="Active Conversations"
  value="24"
  icon={<MessageSquare />}
  trend={{ value: 12, direction: "up" }}
/>
```

### Sidebar
```tsx
<Sidebar
  restaurantName="Delicious Bistro"
  userName="John Doe"
  onLogout={handleLogout}
/>
```

## 🔄 Data Flow

### State Management
- React hooks for local state
- Supabase for persistence
- Context API ready for global state

### API Integration
- Supabase REST API
- OAuth providers (Google)
- Twilio webhooks (incoming messages)
- Menu crawling service

## 🧪 Testing Recommendations

### Auth Testing
- Sign up with new email
- Login with existing account
- Google OAuth flow
- Session persistence

### Dashboard Features
- Navigate all menu items
- Add/edit/delete knowledge entries
- Create marketing campaigns
- Test responsive design

### Forms
- Validation on all inputs
- Error handling
- Loading states
- Success feedback

## 📋 Checklist for Production

- [ ] Configure Supabase Auth (Google OAuth)
- [ ] Set up environment variables
- [ ] Configure Twilio for WhatsApp
- [ ] Set up database tables and RLS policies
- [ ] Implement error tracking (Sentry, etc.)
- [ ] Add analytics (Mixpanel, GA, etc.)
- [ ] Configure SMTP for email notifications
- [ ] Set up monitoring and alerting
- [ ] Create database backups strategy
- [ ] Implement rate limiting
- [ ] Add request validation
- [ ] Set up CORS properly
- [ ] Enable HTTPS everywhere
- [ ] Configure CDN for static assets
- [ ] Set up CI/CD pipeline

## 🚨 Security Best Practices

- ✅ Supabase Row Level Security (RLS)
- ✅ Environment variable protection
- ✅ CSRF protection via Next.js
- ✅ Secure session cookies
- ✅ Input validation
- ✅ SQL injection prevention (Supabase)
- ✅ XSS protection (React escaping)
- ✅ Rate limiting ready
- ✅ API key rotation capability

## 📞 Support Features

All dashboard pages include:
- Loading states
- Error boundaries
- Empty states
- Success notifications
- Help text
- Field validation

## 🎯 Future Enhancements

- [ ] Real-time messaging with WebSockets
- [ ] Advanced analytics dashboard
- [ ] A/B testing for campaigns
- [ ] AI training on customer data
- [ ] Integration with POS systems
- [ ] Inventory management
- [ ] Staff management panel
- [ ] Customer CRM
- [ ] Sentiment analysis
- [ ] Multi-language content
- [ ] Mobile app version
- [ ] API for partners

## 📖 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Radix UI](https://www.radix-ui.com)
- [React Hooks](https://react.dev/reference/react/hooks)

## 📝 License

This project is proprietary software.

---

**Created**: 2024-03-30
**Framework**: Next.js 16
**Database**: Supabase (PostgreSQL)
**Deployment**: Vercel/Self-hosted
