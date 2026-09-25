# Well Being — the circle around the son — 2026-09-25

What the owner asked for, in his words, over the day: weekly habits are mandatory;
extras can be added to a day from our side and from his; money given, small notes,
managed by the month; education is a tutor who is invited and only sends day reports;
gym, fitness and other activities are weekly habits; the parent can invite several
people — a co-parent or a tutor — and each has their own point of view, as the son
has his; it is used on the phone. The rest of the ChatGPT brief (screen time per app,
live location, geofences, a rewards economy, bank tracking) is out: what a web app
can honestly do is listed in section 5.

Built on the LOCAL CLONE only (`orbit_clone`, :5433), dev server on :3010 because
another project holds :3000 on this machine. Production is untouched; the migration
runs there on the next deploy and needs the owner's written yes.

---

## 1. What already existed

Well Being (phases 34–46): one Person per CEO with a walled PERSON login that lands on
`/person`; a segmented weekly habit grid with targets and MET/MISSED/NA marks; rules
the manager schedules and the person ticks; tasks the manager sets and the person
ticks; a nudge (bell + push); a weight monitor the person never sees; "monitoring
managers" (RoutineCollaborator, READ_ONLY / EDITABLE) — the panel switched off since
2026-09-04 because nobody but the CEO had Well Being. The app is an installed web app
(manifest + hand-rolled service worker, web push, camera capture in notes and chat).

## 2. The picture, in the parent's terms

| Block | Who enters it | Where |
|---|---|---|
| Weekly habits, mandatory (gym, tennis, study, screens are habits) | son marks, parent marks | Tracker, unchanged |
| Extras for the day, from the parent | CEO or co-parent | Tracker → Tasks, as before |
| Extras for the day, the son's own | son | his Today tab, "Your own" + an add line |
| Money by hand: given / spent, note, month totals | parent logs given, son logs spent | Money tab (both sides) |
| Tutor's or coach's day report: covered, homework, a line | the tutor, after the session | `/mentor`, one form |
| People around him: co-parent, tutor | CEO invites | Circle tab |
| The 30-second picture | computed | Summary: Today card, weekly score, reports this week, money this month |

## 3. The decision that kept it small: no new role

A co-parent and a tutor are PERSON-role logins, exactly like the son. Thirty-odd
places already keep PERSON out of People, pickers, mentions, meetings, the tomorrow
digest and the work API; a new enum value would have had to be threaded through every
one of them. Instead the KIND is data:

- the son has a `Person` row (`Person.userId`) → `SON`
- a co-parent has an accepted `RoutineCollaborator` with `kind = "FAMILY"` → `FAMILY`
- a tutor/coach has one with `kind = "MENTOR"` (+ `subject`) → `MENTOR`

`lib/session.ts › walledKind(userId)` decides once; `requirePerson` (the son),
`requireManager` (the CEO, or a FAMILY login), `requireMentor`, `requireWalled` (any of
the three, for `/api/routine/who`) gate the routes. `middleware.ts` lets a PERSON-role
cookie reach `/person`, `/family`, `/mentor` and `/api/routine/*`; the handlers do the
rest (the son on `/api/routine` is 403 from `requireManager`, as the rig proves).
`getAccessibleRoutines` counts FAMILY collaborations only, so a tutor opens nothing but
his report screen.

## 4. Schema (additive, `20260925120000_circle_money_reports`)

- `RoutineCollaborator.kind` (default FAMILY), `subject`
- `RoutineTask.addedBy` (default MANAGER; PERSON for the son's own extras)
- `MoneyEntry` — person, date, amount (whole rupees), kind GIVEN|SPENT, note, side
  PARENT|PERSON, addedByName (a snapshot: a removed co-parent's lines stay readable)
- `MentorReport` — person, collaborator (cascade: removing the tutor removes his
  reports), date, subject (copied at write time), covered, homework?, note?

## 5. What the phone can and cannot give (research, 2026-09-25)

Cannot, from a web app: screen time per app (Apple's DeviceActivity refuses to export;
Google Family Link has no API — issue 302210616 open), background location, geofence
alerts, device lock. Can: push, one-tap check-ins with a camera photo, a location stamp
on a tap while open. Hourly location WITHOUT writing a native app: OwnTracks, Overland
or Traccar Client on his phone, permission granted once and visible, posting to an
Orbit endpoint (OwnTracks posts JSON lat/lon/tst/batt and wants `[]` back; Overland
posts GeoJSON batches with a bearer token and wants `{"result":"ok"}`; Traccar's OsmAnd
form is id/lat/lon/timestamp). Parked until the CEO asks for the map inside Orbit;
Find My / Google Maps sharing cover it today. Open-source patterns borrowed: Loop
Habit Tracker's decaying score (a miss dents, never resets), Family Organizer's
parent-review of a child's work, FamilyHub's per-member routines. Not borrowed:
OpenChore / Pointsy points economies (a 16-year-old), Lantern Watch (router-level).

## 6. The API (all under `/api/routine`)

Parent side — `requireManager` then `requireRoutineAccess(actor, ?person=, {write|ownerOnly})`:
`GET money?month=` · `POST money` · `DELETE money/[id]` · `POST circle` (creates a
PENDING PERSON user + an ACCEPTED collaborator, issues the set-password link, optionally
mails it) · `PATCH circle/[id]` · `DELETE circle/[id]` (deletes the user; cascades) ·
`POST circle/[id]/resend`. `GET /api/routine` now carries `money` (this month),
`reports` (the shown week), `circle` (owner only).
Son — `requirePerson`: `POST kid/tasks` · `DELETE kid/tasks/[id]` (his own only) ·
`GET kid/money?month=` · `POST kid/money` · `DELETE kid/money/[id]` (his own only);
`GET kid` carries `money` and the latest 5 `reports`.
Any walled login: `GET who` → SON | FAMILY | MENTOR (the pages route on it).
Tutor — `requireMentor`: `GET mentor` · `POST mentor/reports` (his student only, not
a future date; bells + push to the CEO, co-parents and the son) · `DELETE mentor/reports/[id]`.

## 7. Screens (phone first, 390 px)

- Son `/person`: Today (For you · Your own + add line · From your tutors), Habits,
  Rules, Money (month, Got/Spent, add line, his own rows removable).
- CEO `/routine`: Summary (Today card, weekly score, From tutors, Money this month),
  Tracker (as before), Money (month nav, Given/Spent, Add, list), Circle (people,
  invite form, link to copy for WhatsApp).
- Co-parent `/family`: the CEO's screens, standalone (no work chrome), minus Circle,
  read-only or editable as granted.
- Tutor `/mentor`: one form per student and the past reports.

## 8. The second pass (same day): calendar, map, the agreement, plain look parked

- **Calendar** tab on both screens (`components/routine/calendar-view.tsx`): a month
  grid with dots (tasks, tutor report, money) and, for the parent, a habit bar per
  day; a day panel underneath. Data: `GET /api/routine/calendar?month=` and
  `GET /api/routine/kid/calendar?month=` (the son's side never carries the habit
  rollup). `buildCalendarMonth` in lib/routine.ts.
- **Map**: the son's Today gets a "Where are you?" card (place pills, optional note,
  the phone's position once if allowed → `POST /api/routine/kid/checkin`); both sides
  get a Map tab (Leaflet + OpenStreetMap, no key) with the day's points and a "Last
  seen" line (`GET /api/routine/location?day=`, `…/kid/location`). **Phone sharing**
  (owner only, `POST /api/routine/location/sharing {on}`) mints a link
  `/api/routine/feed/<token>` that OwnTracks (HTTP mode) or Overland on his phone
  posts to — permission granted once on the phone, visible to him, "Sharing with your
  parents: on" on his Map tab. The feed answers `[]` / `{"result":"ok"}`, skips
  out-of-range or far-future points, caps 1000 phone points a day.
  Schema: `LocationPoint`, `Person.feedToken` (migration `20260925150000`).
- **The Family Routine Agreement** (the owner's own sheet, pasted 2026-09-25) is now
  the grid: 7 segments, 15 items, targets 5/5/7 · 7/7 · 7/5 · 5/7 · 4 · 7/7 · 7/7/7 = 94
  a week; `DEFAULT_SEGMENTS` seeds it for a new person. Its **non-negotiables** are
  logged only when crossed: `NonNegotiableMark.crossed` (migration `20260925170000`),
  `PATCH /api/routine/non-negotiable-mark {crossed}` (parent side), the son's Rules
  tab read-only, the summary line "0 crossed this week — should be 0". The phase-42
  "schedule days / tick done" flow is retired (its `done` column stays for old rows).
- **Look**: the developer first asked for an iOS-style theme, then for plain Spire
  colours (teal #0F766E, cream #F0EDE8, white cards, no glass), then "tech first, UI
  later". The screens keep today's glass look; the plain Spire look is specified in
  the second-pass workflow script and is one scoped CSS block + a root class away.

## 9. Third pass (same evening): the log, places, the app's own notes, screen time, task spans

- **The day's log** under the map on both sides (`components/routine/location-log.tsx`):
  every position in the order it happened — time, where, how (check-in / app /
  phone). **Named places** (`Place`, migration `20260925190000`): the parent taps
  "Name" on a line of the log; a position within 150 m then reads "near School",
  and the map shows the ring. Time labels sit on every pin.
- **The app notes where he is** (`components/routine/use-app-ping.tsx`,
  `POST /api/routine/kid/ping`, source APP): once when he opens the app and on the
  hour while it stays open, after one "Allow" tap; ten minutes between notes. A
  browser cannot do this closed — phone sharing covers that. While sharing is on
  the "Where are you?" card gives way to one line saying so.
- **Screen time** (`ScreenTimeEntry`, `Person.screenLimitMin`, migration
  `20260925210000`; `components/routine/screen-section.tsx`): typed in from the
  phone's own Screen Time page — the day's total and the top apps — against a
  daily limit the parent sets (90, the agreement's number). Seven-day bars; a saved
  day marks the grid's "screen time" line MET or MISSED by itself. No web app can
  read another app's usage, so this is the honest shape.
- **Tasks** take a day, a from–to span (`RoutineTask.startDate`, migration
  `20260925200000`; the task stands on every day between) or any day; "This week /
  Any day" is gone. The **money note is optional** ("Money given" / "Money spent"
  when empty) — a parent logging ₹300 was being refused for a missing word.
- Tested the way a person uses it: `.localdb/human-pass.mjs` taps through every
  screen at phone size (23 steps) → `records/evidence/circle-3/`.

## 10. Late evening: money out, screen time only seen, a Tutors tab

- **Pocket money is gone completely** (developer: "remove the money management too,
  completely"): no tab on either side, no routes, no MoneyEntry table (migration
  `20260925230000` drops it), no money on the calendar or the Summary.
- **Screen time was built as a typed-in window, then removed** the same evening:
  no web app can read another app's usage, and typed numbers from a teenager are
  worth nothing ("remove screen time"). Migrations `20260925230000` and
  `20260925235000` drop the limit and the table. The honest automatic paths are
  Apple Screen Time through Family Sharing (iPhone; nobody else can export it) or
  Google Family Link, or on Android a native companion app reading usage stats —
  a separate build.
- **The map shows only where he is now** (the latest position); the day's history
  is the punch log under it. Place names are unique per person (409 on a repeat).
- **Tutors tab** on the parent side (`GET /api/routine/reports`, latest 100,
  `components/routine/tutors-section.tsx`): everything the tutors punched in,
  organised by day. The Summary now shows only today's under "From tutors today".

## 11. Evidence and demo

`scripts/check-circle.ts` and `scripts/check-circle-2.ts` (API walls + browser,
phone-size screenshots) → `records/evidence/circle/` and `records/evidence/circle-2/`. Demo on the clone, invented: Arjun (arjun.wb@orbit.local /
orbit123), Priya the co-parent (priya.wb@orbit.local / orbit1234), Dr Rao Maths and
Rahul Sharma Tennis (rao.tutor@ / coach.wb@orbit.local / orbit1234). None of it is on
production.
