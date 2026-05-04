# Graphic assets — what Play requires vs. what you have

## Required by Play (production release will be blocked without these)

| Asset | Spec | Status | Action |
|---|---|---|---|
| App icon (hi-res) | **512 × 512 px**, 32-bit PNG with alpha, ≤ 1 MB | You have `mobile/assets/icon.png` (verify size) | If it isn't 512×512, export a 512 from the original artwork. Do **not** upscale a small PNG — Play rejects blurry icons. |
| Feature graphic | **1024 × 500 px**, JPEG or 24-bit PNG (no alpha) | Missing | Create one. Suggestion below. |
| Phone screenshots | 2 – 8 images, 16:9 or 9:16, min 320 px short side, max 3840 px long side, JPEG or 24-bit PNG | Missing | Capture from a real device or Android emulator (see capture commands below). |

## Optional but worth adding

| Asset | Spec | Why |
|---|---|---|
| 7-inch tablet screenshots | 1 – 8, min 320 px | Lets Play list you on tablets. |
| 10-inch tablet screenshots | 1 – 8, min 320 px | Same. |
| Promo video | YouTube URL | Can lift conversion materially; not required. |

> Note: your `app.json` sets `"supportsTablet": false` for iOS. Android has no equivalent flag — if you don't upload tablet screenshots, Play just shows a "designed for phones" notice on tablet listings. That's fine.

---

## Suggested screenshots (8 total, in this order)

The first 2 screenshots are what most users see in the store carousel — lead with the most differentiated screens.

1. **Overview / dashboard** — `app/(app)/overview.tsx` showing today's KPIs, AI status, and approvals stack. *Caption: "كل ما يحدث في مطعمك — في شاشة واحدة"*
2. **Inbox** — `app/(app)/inbox/index.tsx` with several conversations, filter chips visible. *Caption: "صندوق رسائل واتساب موحَّد لكل الفريق"*
3. **Conversation detail with approval prompt** — `app/(app)/inbox/[id].tsx`. *Caption: "وافِق على ردّ البوت أو عدِّله قبل الإرسال"*
4. **Approvals list** — `app/(app)/approvals.tsx`. *Caption: "تصعيدات لحظية مع شرح نية العميل"*
5. **Campaigns list with delivered/read counters** — `app/(app)/campaigns/index.tsx`. *Caption: "أطلِق حملات واتساب وتابِعها لحظيًا"*
6. **Team performance / roster** — `app/(app)/team/index.tsx`. *Caption: "أداء الفريق وزمن الاستجابة في الوقت الفعلي"*
7. **Customer directory** — `app/(app)/customers/index.tsx`. *Caption: "كل عميل ومحادثاته السابقة في مكان واحد"*
8. **Shifts** — `app/(app)/shifts.tsx`. *Caption: "نظِّم الورديات وتأكَّد من تغطية الفريق"*

### How to capture them

**Option A — physical Android device (cleanest):**
```bash
# 1. Plug in over USB with developer mode + USB debugging
adb devices             # confirm device shows up
# 2. Open the app, navigate to each screen, then:
adb exec-out screencap -p > screenshot-1-overview.png
# repeat for each screen
```
Resulting PNGs from a typical Pixel-class device (~1080×2400) are accepted by Play as-is.

**Option B — Android emulator:**
Open Android Studio → Device Manager → start a Pixel 7 emulator → run `expo run:android` → use the emulator's camera icon to save each screenshot.

**Option C — already have iPhone screenshots?**
You can't use them. Play requires Android screenshots; iOS chrome (notch, home indicator) gets your listing rejected. Re-capture on Android.

### Screenshot polish (optional)

Your screens are Arabic — to make the listing more striking, drop each screenshot into a 1290×2796 frame with a one-line Arabic caption above the device frame. Tools: Figma, Canva, or [previewed.app](https://previewed.app/). Skip if you want to ship faster — raw screenshots are accepted.

---

## Feature graphic

Spec: **1024 × 500 px**, no alpha, no transparent areas, no rounded corners.

Suggested layout (right-to-left because it's an Arabic listing):
- Right third: app icon enlarged + the wordmark "نهج بوت".
- Left two-thirds: a tagline like "مساعد واتساب الذكي لإدارة مطاعمك" on a navy gradient (#1e3a8a → #25D366) matching your splash background and notification accent color.
- Avoid putting important text in the bottom 100 px — Play often overlays the install button there.

If you need this generated, point me at where your brand artwork lives (e.g. `/mobile/assets/`) and I'll produce a draft SVG/PNG.

---

## Adaptive icon (for Android — already configured)

Your `app.json` sets:
```json
"adaptiveIcon": {
  "foregroundImage": "./assets/icon.png",
  "backgroundColor": "#1e3a8a"
}
```
This bakes into the AAB at build time, so nothing to upload separately for the launcher icon. The 512×512 hi-res icon you upload to Play is for the **store listing only** — it's a different asset.
