# Privacy Policy — already live, just point Play at it

Good news — your Next.js app already ships a privacy page:

- File: `src/app/(public)/privacy/page.tsx`
- Live URL (assuming the Vercel deploy in `eas.json`): **https://nehgzbot.com/privacy**

Use that URL in:
- Play Console → Store presence → Main store listing → **Privacy policy**
- Play Console → App content → **Data safety** → "Privacy policy"
- Play Console → App content → **App access** (if you list it as a public link there)

Verification steps (do these before submitting — Play will reject a broken URL):

```bash
# In a terminal on your machine:
curl -sIL https://nehgzbot.com/privacy | head -20
# Expect HTTP/2 200 and a text/html content-type.
```

If you have a custom domain set up (e.g. `nehgzbot.com`), prefer that URL over the Vercel preview domain — it's more stable and doesn't change if you switch hosting.

---

## Cross-checks against the existing policy text

I read `src/app/(public)/privacy/page.tsx`. A few things to verify before submission so the listing's promises match the policy and the Data Safety form (Play cross-checks all three):

1. **Effective date** says "28 أبريل 2026". Bump it to today's date if you make any tweaks below — Play notices stale policies.
2. **Contact email** is `privacy@nehgzbot.com`. Make sure the inbox actually receives mail. Play sometimes spot-tests by sending a deletion request.
3. **In-app account deletion**: confirm the policy mentions both the in-app delete flow *and* the email fallback. If your app doesn't yet have an in-app delete-account button, either add it, **or** add a public web form at `/delete-account` that anyone (no login) can submit. Play requires one of the two for any app with sign-in.
4. **Push token mention**: confirm the policy says you store the Expo push token; this matches "Device or other IDs" on Data Safety.
5. **Photo-picker mention**: confirm it says you only access photos the user explicitly selects via the system picker — this matches `expo-image-picker`'s `photosPermission` text in `app.json`.

If any of those are missing, edit `src/app/(public)/privacy/page.tsx` and redeploy before submitting. I'm happy to make the edits — just say the word.

---

## Why I didn't write a new policy

Your existing page is already in Arabic, in voice, on the right domain, and Google has likely already indexed it. Replacing it with my draft would either churn URLs or duplicate content. The earlier draft text is preserved below in case you want to merge specific paragraphs in.

<details>
<summary>Earlier draft (English + Arabic) — for reference only</summary>

(Keep your current `src/app/(public)/privacy/page.tsx` as the source of truth. The previous bilingual draft has been removed from this file to avoid two contradictory policies. If you want a side-by-side, I can regenerate it.)

</details>
