# Restructure verdict — Account (`/settings/account`)

Shot 2026-09-04 against the local clone as `dev@orbit.local` (RESOURCE).
Evidence in `records/evidence/restructure/settings-*.png`.

## 10-second test

**Pass.** Three things, top to bottom: who you are (face, name, email), how
Orbit reaches you (three switches — "Alerts on this device", "Email alerts",
"WhatsApp alerts" — and a number box), and one form to change your password
with one blue button. Every switch has a one-line status under it in plain
words ("Blocked in your browser settings", "Meetings and task dates, to
dev@orbit.local", "Add your number below").

## LOOK lines

| Rule | Verdict |
|---|---|
| Warm off-white page | pass |
| White cards | pass — account card, notifications card, password card |
| No borders except accent | pass — cards carry the shadow only (the old page's `border-line` cards are gone); rows split by hairlines inside the card; inputs keep the kit's hairline edge |
| One accent | pass — the blue is "Update password" and the on-state of the switches; the push "Enable" button is now a switch, so there is one primary button on the screen |
| Text ≥ 13px | pass — 17px row labels, 15px inputs, 13px status lines / field labels / hints |
| Sentence case | pass — "Alerts on this device", "Email alerts", "WhatsApp alerts", "WhatsApp number", "Change password", "Update password" |
| No jargon | pass — "push" no longer appears in copy ("Alerts on this device"); grep clean |
| No charts/tables | pass |
| 390 first, then 768/1440 | pass — one column, `max-w-content` centred at every width; the number row wraps its buttons on a phone |
| `max-w-content mx-auto px-4 pt-4` | pass |
| Motion 150–200ms + `useReducedMotion` | pass — switch knob/track 150ms CSS transitions, clamped by the global reduced-motion rule; no framer motion on this page |
| Dates as words | n/a — no dates on this screen |

## What was built

- `account-page.tsx`: account card (Face + name + email · department; no role chip — role words live on People only), `NotificationsRow`, then "Change password" as labelled 44px fields and one primary "Update password".
- `notifications-row.tsx`: `<section id="notifications" class="scroll-mt-20">` so `/settings/account#notifications` (the user menu's "Notifications" link) lands under the sticky header; a small effect scrolls there once the account has loaded, because the section renders after the browser's own jump. Three `role="switch"` rows (44px hit area): push (disabled with the reason when the browser can't or won't), email opt-in, WhatsApp opt-in; WhatsApp number with Save, and "Send test" for the chain (`isManagerRole`, was a literal MANAGER check).

## States checked

| State | Evidence |
|---|---|
| 390 / 768 / 1440 — push blocked (headless Chromium reports `denied`), email on, WhatsApp on with no number ("Add your number below"), Save disabled until the number changes, password button disabled until filled | `settings-390.png`, `settings-768.png`, `settings-1440.png` |
| `#notifications` anchor lands on the section | `settings-notifications-390.png` (see the anchor check below) |

## Console / overflow

| Capture | Console errors / page errors | `scrollWidth` ≤ `innerWidth` |
|---|---|---|
| settings-390 | 0 | 390 / 390 |
| settings-768 | 0 | 768 / 768 |
| settings-1440 | 0 | 1440 / 1440 |
| settings-notifications-390 | 0 | 390 / 390 |

`npx tsc --noEmit` prints nothing for `components/settings`,
`components/set-password-form.tsx`, `components/login-form.tsx`;
`npx next lint --dir components/settings` is clean.

`components/login-form.tsx` and `components/set-password-form.tsx` were
checked for text under 13px and needed no change (smallest is `text-sm`, 15px).

## Unverified

- The push switch in its "on" state and the enable flow (permission prompt → subscribe) — headless Chromium denies notifications, and the server has no VAPID key on the clone (the "aren't switched on for Orbit yet" line would show under the card when the browser allows push).
- "Send test" (chain roles only) — dev is a team member, so it is not on screen; not exercised.
- Saving a number, flipping the email/WhatsApp switches, and changing the password — not fired; same `updateMe` / `changeMyPassword` calls as before.
- The account card's "· department" suffix — dev has no placement, so only the email shows.
