# Play Console — production submission checklist

Follow this top-to-bottom inside [Google Play Console](https://play.google.com/console). Every section that has a yellow ! must turn green before you can hit **Send for review** on the production release. Estimated time: 60–90 minutes if you have all assets ready.

> ⚠ **Heads-up about new personal accounts:** If your Play developer account was created **after Nov 2023** as a personal (not organization) account, Google requires **14 days of closed testing with at least 12 testers** before you can publish to production. If that's you, ship to **Closed testing** first instead of production. To check: Play Console → Setup → "App content" → if you see a "Production access" banner asking for testing requirements, you're affected. Tell me and we'll switch tracks.

---

## 0. Prerequisites you should have on hand

- [ ] The signed AAB file from EAS (`*.aab`).
- [ ] 512×512 hi-res icon PNG.
- [ ] 1024×500 feature graphic.
- [ ] 2–8 phone screenshots (PNG/JPEG).
- [ ] Public privacy policy URL: `https://nehgzbot.com/privacy`.
- [ ] Working support email: `support@nehgzbot.com`.
- [ ] A test account (email + password) for Google's reviewer to sign in. **Required** because the app is gated behind a login.

---

## 1. Create the app entry (skip if already done)

Play Console home → **Create app**.

| Field | Value |
|---|---|
| App name | نهج بوت — مساعد واتساب للمطاعم |
| Default language | Arabic (ar) |
| App or game | App |
| Free or paid | Free |
| Declarations | Tick both: meets Developer Program Policies + US export laws |

Click **Create app**.

---

## 2. Set up your app — the "App content" panel (left nav → Policy → App content)

Each row below has a green check when complete. Order matters — do them top-to-bottom.

### 2.1 Privacy policy
- URL: `https://nehgzbot.com/privacy`
- Save.

### 2.2 App access
- Choose **All or some functionality is restricted**.
- Add instructions:
  ```
  The app is a B2B tool. To review, please use:
  email: reviewer@nehgzbot.com
  password: <generate a long random one>
  After login, the dashboard, inbox, approvals, campaigns, team, and customers tabs are all reachable from the bottom nav.
  ```
- ⚠ Create that reviewer account ahead of time on the staging/production environment and seed it with one test restaurant + a few demo conversations so the reviewer sees a non-empty UI.

### 2.3 Ads
- Does your app contain ads? **No**.

### 2.4 Content ratings
- Click **Start questionnaire**.
- Email: support@nehgzbot.com
- Category: **Productivity / Tools / Utility**.
- Answers: see `03-content-rating.md` (all "No").
- Submit. Expected outcome: rated **Everyone / 3+**.

### 2.5 Target audience
- Target age groups: **18 and over** (this is a B2B tool for restaurant employees).
- Appeals to children? **No**.
- Save.

### 2.6 News app
- Is this a news app? **No**.

### 2.7 COVID-19 contact tracing & status apps
- Is this a contact-tracing or status app? **No**.

### 2.8 Data safety
- Click **Start**, then complete every section using `02-data-safety.md` as the answer key.
- Save → **Submit**.

### 2.9 Government apps
- Is this app developed on behalf of a government? **No**.

### 2.10 Financial features
- Does the app contain financial features (loans, P2P payments, securities)? **No**.

### 2.11 Health
- Does the app provide health-related features? **No**.

### 2.12 Advertising ID
- The app does **not** use the Advertising ID. Mark accordingly.

### 2.13 Actions on Google
- Skip.

---

## 3. Store presence

### 3.1 Main store listing (left nav → Grow → Store presence → Main store listing)

Paste the Arabic strings from `01-store-listing.md`:
- App name
- Short description
- Full description

Upload graphics (specs in `06-graphic-assets.md`):
- App icon (512×512)
- Feature graphic (1024×500)
- Phone screenshots ×2–8 *(go for 4–6, ordered as suggested)*

Save → if you want to add English, scroll to "Translations" and add **English (United States)**, then paste the English strings.

### 3.2 Store settings
- App category: **Business**
- Tags: choose up to 5 from the curated list — picks: *Business communication*, *Customer support*, *Office*, *Project management*, *Productivity*.
- External marketing: **Allow** (default).

### 3.3 Store listing contact details
- Email: `support@nehgzbot.com`
- Phone: optional, can leave blank
- Website: `https://nehgzbot.com` (or your custom domain).

---

## 4. Production release

### 4.1 Set up signing (one-time)

Left nav → Test and release → Setup → **App signing**.

Because EAS Build manages your keystore, you'll be uploading an AAB that's already signed by Google's Play App Signing flow. You have two options:

**Option A — Let EAS handle signing (recommended).** When you ran `eas build`, EAS asked whether to generate or use an existing keystore. The first AAB you upload to Play registers that signing key with Play App Signing automatically. Just upload — Play will accept it.

**Option B — Use Play's Play App Signing key.** If you've previously built with another key, you'll need to follow Play's "Upload a key" flow. Skip unless you specifically need this.

Check which option applies before uploading. If you're not sure, run:
```bash
cd /Users/mahmoudmac/Documents/projects/whatsapp-cs/mobile
npx eas credentials --platform android
# then pick the production profile and inspect the keystore fingerprint.
```

### 4.2 Create the production release

Left nav → **Test and release** → **Production** → **Create new release**.

| Field | Value |
|---|---|
| App bundles | Drag-and-drop your `.aab` |
| Release name | Auto-fills from the version code, e.g. `1.0.0 (1)` — accept |
| Release notes (Arabic) | `الإصدار الأول من نهج بوت — صندوق رسائل، تصعيدات، حملات، أداء فريق.` |
| Release notes (English, if added) | `First release of Nehgz Bot — inbox, approvals, campaigns, team performance.` |

**Save** → **Next** → on the review screen, fix any remaining warnings → **Send X changes for review**.

Review typically takes 1–7 days for a first submission. You'll get an email when the decision lands.

---

## 5. After submission — a few things you'll likely hit

- **First-app sandboxing question**: Play may ask you to confirm declared permissions one more time during review. Re-affirm and the review continues.
- **WhatsApp brand keyword**: Apps that mention WhatsApp in the title or description sometimes trip an automated brand-impersonation check. The mitigations are already in our copy: we say "WhatsApp Business Platform" (not "WhatsApp clone"), we don't use the WhatsApp green-and-white logo in the icon, and we make clear this is a B2B tool that connects to the user's own WhatsApp Business number. If you get a takedown notice citing brand impersonation, reply with: "The app uses Meta's official WhatsApp Business Platform via approved API access; it does not impersonate WhatsApp Inc." That usually clears it.
- **Reviewer can't log in**: by far the most common rejection reason. Test the reviewer credentials yourself in a fresh emulator before submitting.

---

## 6. Once approved

- The release rolls out automatically at the percentage you chose (default 100%).
- Watch crash-free rate in Play Console → Quality → Crashes for the first 48 hours.
- Set up Play Console → Settings → **API access** so future updates can ship via `eas submit` without browser clicks.
