# Resubmit checklist — Nehgz Bot 1.0.4 (build 2)

A tight, do-this-in-order list. Should take ~45 minutes of mostly-waiting on builds.

## 1. Set the demo restaurant env var on production

The Hub demo bypass is gated by `APPLE_REVIEW_DEMO_RESTAURANT_IDS`. Set it to the UUID(s) of the restaurant(s) tied to your App Store reviewer credentials.

```
APPLE_REVIEW_DEMO_RESTAURANT_IDS=<restaurant_uuid_for_apple_demo>
```

If you have separate demo accounts for Apple and Google, use a comma:

```
APPLE_REVIEW_DEMO_RESTAURANT_IDS=uuid-apple,uuid-google
```

**Where:** Vercel project → Settings → Environment Variables → Production.
**Verify:** redeploy production after saving, then `curl -i https://nehgzbot.com/api/mobile/hub/status` with a valid Bearer token for the demo account. You should see `paired: true` with merchant name "صالون نِحجز التجريبي".

## 2. Confirm the demo account is an admin

Anything less than `team_members.role = 'admin'` means the reviewer can't see the Hub gateway at all. From Supabase SQL editor:

```sql
update public.team_members
set role = 'admin', is_active = true
where user_id = (select id from auth.users where email = '<apple_reviewer_email>')
  and restaurant_id = '<apple_demo_restaurant_uuid>';
```

## 3. Commit and push the code changes

```
cd /Users/mahmoudmac/Documents/projects/whatsapp-cs
git add -A
git commit -m "fix(mobile): gate ai toggle behind manager role; add hub review-demo bypass; bump to 1.0.4(2)"
git push
```

Wait for Vercel to finish the production deploy before the next step.

## 4. EAS iOS build

```
cd /Users/mahmoudmac/Documents/projects/whatsapp-cs/mobile
eas build --platform ios --profile production
```

When prompted, let EAS auto-increment if it asks. App.json already declares `version: 1.0.4` and `ios.buildNumber: "2"`.

## 5. Submit to App Store

Once the build appears in App Store Connect → TestFlight → iOS Builds:

1. Open the build, finish processing.
2. Open the existing rejected submission in the review thread.
3. Click "Resubmit / Resolve" and attach the new 1.0.4 (2) build.
4. Paste the reply from `APPLE_REPLY_v1.0.4.md` into the review notes / message.

## 6. Smoke test the demo before submitting

Sign in to the demo account from a TestFlight install (or the simulator with the dev build):

- [ ] Login lands on gateway selector
- [ ] Both "نِحجز بوت" and "نِحجز هَب" cards are visible
- [ ] Tapping "نِحجز هَب" shows the dashboard with non-zero numbers and charts
- [ ] Bookings tab lists ~12 bookings across statuses
- [ ] Tap a booking → detail screen renders
- [ ] Services tab shows 5 services (one disabled)
- [ ] Staff tab shows 4 staff members
- [ ] More tab shows merchant name "صالون نِحجز التجريبي"
- [ ] "تبديل الخدمة" goes back to the gateway picker
- [ ] On "نِحجز بوت" Overview: تشغيل/إيقاف البوت button appears for admins only

If anything is empty or shows an error, stop and check the Vercel logs — the env var probably isn't picking up the restaurant ID.

## 7. Don't forget Google Play

The same code ships in 1.0.4 for Android. If Play asked for anything else, address it; otherwise just bump and submit a fresh internal release with the new APK/AAB.
