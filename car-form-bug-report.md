# Car Creation Form — Bug Report
**URL tested:** http://localhost:3000/ar/provider/cars/new
**App:** BooktFly (بوكت فلاي)
**Date:** 2026-04-05
**Locale:** ar (RTL)

---

## Critical Bugs

### 1. Empty-form submission shows NO feedback to the user
**Expected (per test plan):** red error banner, toast notification, scroll to first invalid field.
**Actual:** Clicking **نشر السيارة** with an empty form produces nothing — no toast, no red banner, no border highlighting, no scroll, no network request. The user gets zero indication that anything happened.
**Severity:** High — users will click repeatedly thinking the button is broken.

### 2. Validation messages are raw English Zod errors
When validation does fire (after partial data is entered), the error banner shows a mix of Arabic heading + raw English library text, e.g.:
> يرجى تصحيح الأخطاء التالية:
> Invalid input: expected number, received NaN

**Problems:**
- Not localized (English in an Arabic UI).
- Doesn't name the offending field, so users can't tell what to fix.
- Exposes internal schema details ("expected number, received NaN") to end users.
**Severity:** High.

### 3. Hidden `pickup_latitude` / `pickup_longitude` silently block submission
These two fields are `required` + typed as number but are **hidden** from the user. If the geolocation button is never clicked, they stay empty and the form validator reports `NaN`, blocking submission with no visible field to correct.
**Severity:** High — a form can be fully filled out and still refuse to submit with no clear cause.

### 4. "Get Current Location" button appears non-functional
Clicking the geolocation button produced none of the documented effects:
- Button did not turn green.
- Text did not change to "Location detected successfully".
- `pickup_location_ar` / `pickup_location_en` were not auto-filled.
- Hidden lat/lng inputs remained empty (see bug #3).
**Severity:** High — this is the only path to satisfy the hidden lat/lng requirement.

### 5. Missing i18n translations in provider sidebar
On first render, the sidebar shows raw translation keys:
- `PROVIDER.GROUP_FLIGHTS`
- `PROVIDER.GROUP_ACCOMMODATIONS`
- `PROVIDER.GROUP_CARS`
- `PROVIDER.GROUP_PACKAGES`

Console throws: `IntlError: MISSING_MESSAGE: Could not resolve 'provider.group_flights' in messages for locale 'ar'`.
They self-correct after a re-render, but the flash of raw keys is visible on page load.
**Severity:** Medium.

---

## Minor Issues / Inconsistencies

### 6. Year bounds don't match the spec
Test plan states the valid year range is **2000–2027**. The actual input has `min="2000" max="2030"`. Either the spec or the input is stale.
**Severity:** Low.

### 7. Price field has no upper bound
`price_per_day` enforces `min="1"` (good) but has no `max` attribute. Users can submit unrealistic values (e.g. 99999999).
**Severity:** Low.

---

## Working Correctly

- **Test 4 — Branch pickup type:** selecting "فرع" for pickup_type correctly reveals `pickup_branch_name_ar` / `pickup_branch_name_en`. Same behavior for `return_type` → `return_branch_name_ar/en`.
- **Test 5 — Availability dates:** unchecking "الحجز الفوري" (instant_book) correctly reveals the "متاح من" / "متاح حتى" date pickers.
- **Price min validation:** `min="1"` correctly blocks 0 and negative values.
- **Category dropdown:** 5 options present (sedan, suv, luxury, van, economy).
- **Form persistence across radio switches:** previously entered branch names survive when toggling pickup_type back and forth.

---

## Tests Not Completed

- **Test 3 — Full submission with all fields:** blocked by bug #3 / #4 (hidden lat/lng + broken geolocation button prevent any successful submission path).
- **Test 6 — Image upload (5 images + remove):** not executed in this session.

---

## Recommended Fixes (priority order)

1. Wire up the submit handler so `handleSubmit` actually fires validation + surfaces the Zod errors on empty submit (bug #1).
2. Localize all Zod/RHF error messages through next-intl; include field labels in the error banner (bug #2).
3. Either surface the lat/lng capture state as a visible, required UX step with clear error messaging, or make these fields optional server-side (bug #3).
4. Debug the geolocation button click handler (bug #4) — check `navigator.geolocation` permission flow and state updates.
5. Add the missing `provider.group_*` keys to the `ar` locale file (bug #5).
6. Reconcile year max with spec, add reasonable `max` to price (bugs #6, #7).
