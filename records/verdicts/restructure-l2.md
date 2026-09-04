# Landing L2 — review meetings · Calendar · the three messages · reply links · Reschedule · Needs your OK

Verified on the local prod clone (`orbit_clone`), dev server on :3000, 2026-09-04.
The API side is proven by `npm run flows` (records/evidence/restructure/flows.txt,
37/37) — the screen side by the Calendar / Today verdicts and screenshots
(records/verdicts/restructure-calendar.md, restructure-today.md).

## What is proven (flows F2 + F3, verbatim in flows.txt)

- Adding a milestone creates its review meeting at 11:00 IST with the lead and
  every task holder invited (`reviewEventId` non-null; the attendee list follows
  the tasks — giving a task in the box adds the person to the review).
- `GET /api/cron/tomorrow` with the secret → `{ok, people: N}`; without → 401.
- Message (b) built for a member with a meeting AND a task due tomorrow; its
  email/WhatsApp bodies are in records/evidence/restructure/message-b-email.html,
  message-b-email.txt, message-b-whatsapp.txt. Exactly one bell row per person.
- The [Can't] link is a signed, public `/r/<token>` that records `response = NO`
  on the attendee row without a session, and tells the organiser (bell row).
- Reschedule offers three Mon–Fri slots, moves the meeting, clears every reply,
  and re-sends the (b)-style message with fresh links (`resent ≥ 1`, bell row
  "Moved: …").
- A review whose date is today shows on the director's Today under Needs your OK
  and on nobody else's; a manager posting an outcome gets 403; On track + a line
  + 40% lands on the milestone, as a note beside the box, on the project's %,
  and as message (c) to the project people (bell row "…: On track").
- Meeting created/moved/cancelled write a quiet bell row only — no email,
  WhatsApp or push (deliberate; see the plan's deviations).

## Channels

- Email and WhatsApp are not configured on this Mac, so delivery is proven by
  the dedupe/log path and the mock-Twilio probe (scripts/check-phase32-whatsapp.ts:
  26/26 — task_given reaches only the reachable person, via the ContentSid
  template, deduped, graceful on failure) plus the built bodies above.
- Push: the engine is unchanged (lib/push.ts); the bell rows above are the same
  rows push mirrors.

## Screens (see the per-screen verdicts)

- Calendar: deadline / review / meeting chips; day panel shows replies and the
  [I'll be there] [Can't] buttons; [+ Schedule meeting] = project → faces → time.
- Today: Meetings (today + tomorrow) with replies and Reschedule; Needs your OK card.

## Open

None at the API level. Screen-level items are tracked in records/defects.md.
