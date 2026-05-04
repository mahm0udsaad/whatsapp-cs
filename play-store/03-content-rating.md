# Content Rating questionnaire (IARC) — proposed answers

The IARC questionnaire takes ~3 minutes. Play uses your answers to assign a single rating that's shown in the store and shipped to age-restricted regions. Be honest — but Nehgz Bot is a B2B tool with no user-generated public content, so the rating will land at **PEGI 3 / Everyone / 3+** in every region.

When the questionnaire opens you'll first pick a **category**. Choose:

> **Reference, News, or Educational** — *No*, then…
> **Productivity, Business, or Tools** — **Yes** (this is your category)

After that, the questionnaire is yes/no. Answer set:

| Section | Question | Answer |
|---|---|---|
| Violence | Does the app contain depictions of violence? | **No** |
| | …realistic violence? | **No** |
| | …blood / gore? | **No** |
| Sexuality | Sexual content? | **No** |
| | Nudity? | **No** |
| Language | Profanity or crude humor? | **No** |
| Controlled substances | References to alcohol, tobacco, drugs? | **No** |
| Gambling | Real-money gambling? | **No** |
| | Simulated gambling? | **No** |
| User-generated content | Does the app let users **share content with other users**? | **No** *(messages are between a restaurant agent and its own customers — not user-to-user inside the app's user base. If you're unsure, "No" is the correct answer for this kind of CRM.)* |
| User-generated content | Does the app provide an unmoderated forum / chat? | **No** |
| Personal info sharing | Does the app share users' personal info with other users? | **No** |
| Location sharing | Does the app share users' physical location with other users? | **No** |
| Digital purchases | Does the app contain digital purchases? | **No** *(unless you add in-app billing later)* |
| Misc | Does the app feature characters that resemble real people / celebrities? | **No** |

### Expected outcome
- **IARC global rating:** Everyone / 3+
- **PEGI:** 3
- **ESRB:** Everyone
- **Google Play:** Rated for 3+

That's the lowest rating Play offers and removes any age-gating concerns.

> ⚠ One trap: if you answer "Yes" to "users share content with other users", Play forces a 12+ rating and asks for a moderation policy. Restaurant managers chatting with their own customers via the WhatsApp Business API is **not** user-to-user content within the meaning of this question — Meta moderates the WhatsApp side, and the app itself doesn't host a public feed. Answer No.
