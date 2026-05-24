# Apple App Review reply — Nehgz Bot 1.0.4 (build 2)

> Paste this into the App Store Connect review thread. Keep it short — we don't want another round-trip.

---

**Subject:** Build 1.0.4 (2) — fixes review feedback + adds Nehgz Hub gateway

Hi,

Thanks for the feedback. Build 1.0.4 (2) is ready for review with the fixes you flagged plus a small addition.

**What changed**

1. **Toggle button error fixed.** The "تشغيل البوت" / "إيقاف البوت" control on the Overview screen is now manager-gated on the client, with a clear Arabic message if a non-manager account ever reaches it. The previous raw error string is gone.

2. **New gateway: Nehgz Hub.** After signing in, the user picks between two surfaces inside the same app: "نِحجز بوت" (the existing WhatsApp customer-service workspace) and "نِحجز هَب" (booking, scheduling, services and staff for the merchant). Both surfaces are part of the same B2B subscription handled offline by our sales team — no in-app purchase, no pricing, no subscription UI inside the app. This is consistent with Guideline 3.1.3(b) Multiplatform Services, the same model we discussed in the previous round.

**Reviewer credentials**

Please use the same demo account you have on file. With this build:
- The account lands on the gateway picker after login.
- "نِحجز بوت" opens the WhatsApp inbox / overview you've already reviewed.
- "نِحجز هَب" opens a pre-paired demo Hub with sample bookings, services, staff and revenue analytics — no pairing required from your side.

If the demo account on file is no longer working, please let us know and we'll refresh it within the day.

We're not asking you to test in-app purchase flows because there are none. The signup gate at https://nehgzbot.com/signup is unchanged and still business-only behind the affirmation checkbox.

Thanks,
Hamad Ahmed
Nehgz
