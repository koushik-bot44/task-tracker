# Automatic child location — architecture and plan (2026-09-29)

The brief: the child's phone collects and syncs its position **by itself**, in the
background, after an explicit enrollment and the phone's own permissions. The
parent sees the latest known position, how fresh it is, its accuracy, the phone's
state and battery, the day's history with gaps shown honestly, and can press
**Locate Now**. No manual check-ins as the main path, no stealth, no bypassing
Android or iOS rules, no fabricated positions or times.

This file is the plan, the API contract the native apps are written against, and
the record of what was built. Sections 1–13 answer the brief's closing list.

---

## 1. Current architecture (as found, 2026-09-29)

- **One Next.js 14 app** (app router) on Vercel, Prisma over PostgreSQL (Neon in
  production, an embedded PG 18 clone locally on :5433). Route handlers under
  `app/api/**`, services in `lib/`. No separate backend.
- **Auth:** HS256 JWT session cookie (`lib/auth.ts`, `jose`), user reloaded on
  every request (`lib/session.ts › loadSessionUser`), `sessionVersion` kills old
  sessions. Roles: FOUNDER (the CEO), CO_FOUNDER, HOD, MANAGER, TEAM_LEAD,
  RESOURCE, ADMIN, PERSON. Sign-in rate limit: `LoginAttempt` rows keyed by a
  peppered IP hash (`lib/login-attempts.ts`).
- **Family ("Well Being"):** `Person` = the child, with a walled PERSON login.
  Around him: `RoutineCollaborator` rows — co-parents (kind FAMILY, read-only or
  editable) and tutors (kind MENTOR), all PERSON-role logins told apart by data
  (`lib/session.ts › walledKind`). Access to a child is decided in one place:
  `lib/routine.ts › requireRoutineAccess` (OWNER / EDITABLE / READ_ONLY).
- **Location today** (built 2026-09-25/26):
  - `LocationPoint` rows with `source` CHECKIN (the child's tap), APP (the web
    app notes a position on open and hourly **while open**), OWNTRACKS /
    OVERLAND (a third-party phone app posting to a secret link
    `/api/routine/feed/<token>`, `Person.feedToken`).
  - `placeName` from OpenStreetMap reverse lookup, cached in `GeoName`.
  - Parent Map tab (`components/routine/location-section.tsx`): current
    position on a Leaflet map, the day's punch log, the OwnTracks link switch.
  - Child Map tab (`person-screen.tsx › PersonMap`) and a "Where are you?"
    check-in card shown when sharing is off.
- **Push:** Web Push to browsers only (`lib/push.ts`, VAPID). No FCM/APNs.
- **Crons:** two daily Vercel crons (`/api/cron/tomorrow`, `/api/cron/snooze-wake`),
  `CRON_SECRET`-gated.
- **Tests:** no unit-test runner; behaviour is proven by `tsx` rigs under
  `scripts/` (API + Playwright) and person-style walkthroughs in `.localdb/`.

## 2. Problems found

1. **A web app cannot track in the background.** The APP source only works while
   the page is open; the hourly timer is a browser timer and stops the moment
   the app is backgrounded. This is exactly what the brief forbids relying on.
2. **The only background path is a third-party app** (OwnTracks) configured by
   hand with a secret URL. No enrollment, no device identity, no permission or
   battery state, no way to ask for a fresh fix, no revocation beyond turning the
   link off, and the secret is a bearer URL.
3. **No device model.** Nothing records which phone sent a point, its app
   version, permission state, last heartbeat, or whether it is running.
4. **"Last seen" is shown as if current.** Freshness is only a relative time;
   there is no status telling "fresh" from "the phone has been silent for 6 h".
5. **No idempotency.** A retried upload inserts a second row.
6. **Time handling.** OwnTracks `tst` is trusted as sent; there is no
   received-at, so a late upload looks live.
7. **History draws straight lines through gaps.** The old trail polyline joined
   points hours apart as if the child had walked that line.
8. **No audit trail, no retention.** Location rows are kept forever and nobody
   can see who looked.
9. **Duplicated/obsolete paths:** the check-in card, the APP timer and the
   OwnTracks link overlap; once the device pipeline is proven they become the
   fallback, not the main path.

## 3. Target architecture

```
Parent web dashboard (existing Next.js app, Well Being → Location)
        │  session cookie, requireRoutineAccess
        ▼
Backend API (same Next.js app)  ──►  PostgreSQL (Neon)
        ▲            │
        │            └─► Push abstraction: FCM HTTP v1 (Android) / APNs (iOS)
        │                 (optional; without it Locate Now waits for the next check-in)
        │  device token (Bearer), HTTPS
Child native app (Capacitor 8 shell + native tracker plugin)
   Android: foreground service (type location) + FusedLocation + SQLite queue
            + WorkManager upload/heartbeat + boot receiver + FCM service
   iOS:     CLLocationManager (Always) + significant changes + visits
            + background location mode + file queue + silent push + BGAppRefresh
```

**Why the architecture changes (the brief asks for the reason):** background
collection on a phone is only possible from native code the OS schedules — an
Android foreground service or iOS background location updates. The web app keeps
its job (the parent dashboard and the child's screens); a separate small native
app is added for the phone. The backend stays the same Next.js app: no new
service, no new database.

The native app is deliberately thin: pairing, a permission checklist, a status
screen that always says sharing is on, and a native plugin (`ChildTracker`) that
owns the credentials, the queue, the location service and all networking (so the
device token never touches JavaScript and no CORS is involved).

## 4. Database schema changes (Prisma, additive migration `20260929120000_child_devices`)

- **`ChildDevice`** — one enrolled phone.
  `id, personId → Person (cascade), platform ANDROID|IOS, name, model, osVersion,
  appVersion, tokenHash (unique, sha256 of the device token), tokenIssuedAt,
  revokedAt?, revokedById?, enrolledById, createdAt,
  permission ALWAYS|WHILE_IN_USE|DENIED|NOT_DETERMINED|UNKNOWN, preciseLocation?,
  locationEnabled?, notificationsAllowed?, batteryOptimized?, trackingState
  RUNNING|STOPPED|STARTING|SHUTTING_DOWN|UNKNOWN, batteryLevel?, isCharging?,
  networkType?, queueSize?, pushProvider FCM|APNS?, pushToken?,
  lastHeartbeatAt?, lastLocationAt?, lastContactAt?, lastShutdownAt?, bootedAt?,
  statusAlertedAt?, statusAlertState?, rateWindowStart?, rateWindowCount`.
- **`DevicePairing`** — a short-lived code the parent shows and the child types.
  `id, personId, codeHash (unique), expiresAt, consumedAt?, deviceId?, createdById, createdAt`.
- **`LocateRequest`** — one Locate Now.
  `id, personId, deviceId, requestedById, status PENDING|SENT|DELIVERED|FULFILLED|FAILED|EXPIRED,
  pushProvider?, pushDetail?, failureReason?, requestedAt, sentAt?, deliveredAt?,
  fulfilledAt?, expiresAt, locationPointId?`.
- **`LocationAuditEvent`** — who looked, who asked, who paired, what was purged.
  `id, personId, actorUserId?, deviceId?, action, detail Json?, createdAt`.
- **`LocationPoint`** gains `deviceId?` (SetNull), `clientId?` + unique
  `(deviceId, clientId)` for idempotency, `receivedAt` (default now), `altitude?`,
  `speed?`, `heading?`, `networkType?`, `trigger?`, `isCharging?`. `at` stays the
  device's own timestamp; `receivedAt` is the server's. `source` gains `DEVICE`.
- **`Person`** gains `locationRetentionDays Int @default(90)`.

## 5. API contract

All JSON over HTTPS. Errors are `{ "error": "<plain words>", "code": "<CODE>" }`.

### Device API — `Authorization: Bearer <deviceToken>` (except pairing)

| # | Method + path | Body | Answer |
|---|---|---|---|
| D1 | `POST /api/device/pair` (no auth, 8/min/IP) | `{ code, platform: "ANDROID"\|"IOS", appVersion, model?, osVersion?, name? }` | `201 { deviceId, deviceToken, personName, config }` · `404 PAIRING_INVALID` · `429 RATE_LIMITED` |
| D2 | `POST /api/device/locations` | `{ points: [1..200 × DevicePointIn] }` | `200 { accepted, duplicates, rejected: [{clientId, reason}], locateRequests, config }` |
| D3 | `POST /api/device/heartbeat` | `DeviceStatusIn` | `200 { serverTime, locateRequests, config }` |
| D4 | `POST /api/device/locate/{id}/status` | `{ status: "DELIVERED"\|"FAILED", reason?: "PERMISSION_DENIED"\|"LOCATION_DISABLED"\|"TIMEOUT"\|"UNAVAILABLE"\|"OTHER", detail? }` | `200 { ok: true }` |
| D5 | `POST /api/device/token/rotate` | `{}` | `200 { deviceToken }` (the old token dies at once) |

A revoked or unknown token answers `401 { code: "DEVICE_REVOKED" }` (revoked) or
`401 { code: "DEVICE_UNAUTHORIZED" }`; the app then clears its credentials,
stops tracking and shows "This phone was removed".

```
DevicePointIn  = { clientId: string (8–64, unique per device, e.g. UUID),
                   lat, lng, accuracy?: m, altitude?: m, speed?: m/s, heading?: deg,
                   recordedAt: ISO-8601 (the phone's fix time),
                   trigger?: "BACKGROUND"|"MOTION"|"LOCATE_NOW"|"BOOT"|"HEARTBEAT"|"APP_OPEN",
                   locateRequestId?, batteryLevel?: 0–100, isCharging?, networkType? }
DeviceStatusIn = { permission: "ALWAYS"|"WHILE_IN_USE"|"DENIED"|"NOT_DETERMINED",
                   locationEnabled: bool, trackingState: "RUNNING"|"STOPPED"|"STARTING"|"SHUTTING_DOWN",
                   preciseLocation?, notificationsAllowed?, batteryOptimized?,
                   batteryLevel?, isCharging?, networkType?: "WIFI"|"CELLULAR"|"NONE"|"UNKNOWN",
                   appVersion?, osVersion?, pushProvider?: "FCM"|"APNS", pushToken?: string|null,
                   queueSize?, lastShutdownAt?, bootedAt?,
                   event?: "PERIODIC"|"BOOT"|"SHUTDOWN"|"PERMISSION_CHANGED"|"APP_OPEN"|"LOCATE_NOW" }
DeviceConfig   = { heartbeatSeconds: 900, movingIntervalSeconds: 120,
                   stationaryIntervalSeconds: 900, distanceFilterMeters: 50,
                   locateTimeoutSeconds: 30, maxBatch: 200 }
PendingLocate  = { id, requestedAt, expiresAt }
```

Rules the server enforces: a point is rejected (never altered) if its coordinates
are out of range, its `recordedAt` is more than 10 min ahead of the server or
older than 30 days, or its accuracy is negative. A `clientId` already stored for
the device is counted as a duplicate and ignored. At most 30 device requests a
minute per device.

### Parent API — session cookie, `requireRoutineAccess(actor, ?person=)`

| # | Method + path | Who | Answer |
|---|---|---|---|
| P1 | `GET /api/routine/devices` | any access | `{ devices: DeviceDTO[], pairingActiveUntil? }` |
| P2 | `POST /api/routine/devices/pairing` | owner / editable | `201 { code, expiresAt, serverUrl }` |
| P3 | `DELETE /api/routine/devices/{id}` | owner / editable | `{ ok }` — revokes the phone |
| P4 | `GET /api/routine/location/latest` | any access | `{ status, device, latest, freshness, issues, pendingLocate }` |
| P5 | `GET /api/routine/location?day=` (extended) | any access | the day's points (with source, accuracy, receivedAt), `track: { segments, gaps }` |
| P6 | `POST /api/routine/location/locate` | owner / editable | `202 { request }` · `409 NO_DEVICE` · `429 RATE_LIMITED` |
| P7 | `GET /api/routine/location/locate/{id}` | any access | `{ request }` |
| P8 | `GET /api/routine/location/audit` | owner | `{ events }` |
| P9 | `PATCH /api/routine/location/settings` | owner | `{ retentionDays }` (7–365) |

Cron: `GET /api/cron/location-housekeeping` (`CRON_SECRET`) — retention purge,
expired Locate Now requests, silent-phone alerts. Also run from the existing daily
`snooze-wake` cron so no new Vercel cron entry is needed on the current plan.

## 6. Android implementation plan (Phase 2)

- **Project:** `mobile/` — Capacitor 8 app `com.sgroup.orbit.child`, web layer in
  `mobile/www` (plain HTML/JS, no bundler), native tracker in
  `mobile/android/app/src/main/java/com/sgroup/orbit/child/tracker/`.
- **`TrackingService`** — foreground service, `foregroundServiceType="location"`,
  a permanent notification "Sharing location with your family" (cannot be hidden:
  that is the point). FusedLocationProviderClient, **adaptive**: balanced power,
  every 15 min / 50 m while still; high accuracy every 2 min while moving
  (speed > 1.5 m/s); back to still after 10 min without movement. The OS decides
  the exact timing; nothing promises "every N minutes".
- **`LocationQueue`** — SQLite (`SQLiteOpenHelper`, no extra library): every fix
  is written first, with a UUID `clientId`, then uploaded; deleted only after the
  server answers (accepted or duplicate). Survives app death and reboot.
- **`UploadWorker`** — WorkManager, unique, `NetworkType.CONNECTED`, exponential
  backoff; expedited for Locate Now.
- **`HeartbeatWorker`** — periodic 15 min (Android's minimum): heartbeat, pick up
  pending Locate Now, restart the service if it died, report permission / location
  / battery / network / battery-optimisation state.
- **`BootReceiver`** — `BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`: restarts tracking
  when paired and background permission is granted; reports `bootedAt` and the
  last shutdown. **`ShutdownReceiver`** — `ACTION_SHUTDOWN`: records the time and
  tries a 3-second SHUTDOWN heartbeat (best effort).
- **`LocateNowService`** — FirebaseMessagingService: data message
  `{type: "LOCATE_NOW", requestId}` → ack DELIVERED → `getCurrentLocation`
  (high accuracy, 30 s) → queue with `locateRequestId` → expedited upload; FAILED
  with a reason if permission/location is off. FCM is optional: without
  `google-services.json` the app still works and Locate Now is answered at the next
  heartbeat.
- **Permissions, in order, each explained on screen:** precise location while in
  use → "Allow all the time" (Android 11+ sends the user to Settings; the app shows
  exactly what to tap) → notifications (Android 13+) → "Don't optimise" battery.
  Every change is reported to the parent.
- **What Android does not allow, and the app does not try:** surviving Force Stop
  (a force-stopped app stays stopped until opened), running without the
  notification, collecting without background permission.

## 7. iOS implementation plan (Phase 3)

- Same Capacitor project, `mobile/ios`, Swift plugin `ChildTracker`.
- **CLLocationManager**: When In Use → Always (Apple shows its own prompts; the app
  explains first), `allowsBackgroundLocationUpdates = true`,
  `showsBackgroundLocationIndicator = true` (the blue pill is always visible),
  `pausesLocationUpdatesAutomatically = true`, `activityType = .other`.
- **Significant-location changes + visits** keep working after the app is
  terminated or the phone restarts: iOS relaunches the app in the background on a
  significant change (~500 m) or a visit. Standard updates with a 50 m distance
  filter run while the app is alive. iOS decides timing.
- **Queue:** JSON-lines file in Application Support; uploads with a
  `URLSession` background configuration so they finish after suspension.
- **Locate Now:** APNs silent push (`content-available`), `requestLocation()`,
  upload within the ~30 s background budget. iOS may delay or drop silent pushes
  (Low Power Mode, throttling); the parent sees an honest "waiting" state and the
  request is also answered at the next wake.
- **BGAppRefreshTask** for a heartbeat when iOS grants one.
- **Info.plist:** `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes` =
  `location`, `remote-notification`, `fetch`; `BGTaskSchedulerPermittedIdentifiers`;
  entitlement `aps-environment`.
- **Cannot be built on this Mac** (no Xcode). Build and TestFlight need a Mac with
  Xcode 16+, an Apple Developer account, the APNs key and a bundle ID.

## 8. Parent UX flow

Well Being → **Location** tab (was Map):
1. **Now** card: status pill (Live / Stale / Tracking stopped / Permission off /
   Location off / Phone unreachable / Switched off / Unknown), the place name,
   "Updated 4 min ago" from the phone's own time (and "arrived later" when the
   upload was delayed), accuracy ±m, battery %, charging, network, which phone.
2. **Locate Now** button → "Requesting fresh location…" → "Sent to the phone" →
   "The phone is getting a fix…" → "Updated 6 s ago", or the honest failure
   ("Location is off on the phone", "No answer in 5 min — the phone may be
   offline").
3. Map of the current position with its accuracy circle.
4. **Issues**: permission turned off, location switched off, battery low, battery
   optimisation on, the phone silent, push not set up.
5. **History**: day by day; the day's map with the route drawn only between
   close-in-time points, dashed where there is a gap ("no data 1 h 20 m");
   a timeline with time, place, accuracy and gap rows.
6. **Phones**: enrolled devices, their state, Remove; **Add a phone** shows the
   address and an 8-letter code valid 15 min.
7. **Access log** (owner): who looked, who pressed Locate Now, pairings.
8. **Older ways** (collapsed): the OwnTracks link — kept until the device
   pipeline has proven itself, then retired.

## 9. Child onboarding / permission flow

On the child's phone (the parent standing next to him):
1. Install the Orbit Child app (APK / TestFlight).
2. Enter the family's Orbit address (pre-filled) and the code from the parent's
   screen → paired; the phone shows "This phone shares its location with
   <parent>".
3. Checklist: Location while using → Allow all the time → Notifications →
   Battery (Android) → **Sharing is on**. Each step says why, and each step can
   be done again later; skipped steps are reported to the parent as issues.
4. The status screen stays honest: sharing on, last sent, anything wrong.
   There is no hidden mode and no "stop" button; removal is done by the parent
   (or by uninstalling, which the parent sees as the phone going silent).

## 10. Failure / offline behaviour

| Situation | Phone | Parent sees |
|---|---|---|
| No internet | fixes queue in SQLite / file, upload retries with backoff | last known + "Phone unreachable" after 35 min; points arrive later marked "arrived later" |
| GPS unavailable | no fix is invented; heartbeat still sent | "Stale — in touch, no fresh position" |
| Permission revoked | reported at the next heartbeat or boot | "Permission off" + a notification to the parents |
| Location switched off | reported | "Location off" + notification |
| Phone powered off | best-effort shutdown ping; on boot reports the off period | "Switched off at 22:41" or "Unreachable" |
| Phone restarted | Android boot receiver / iOS significant-change relaunch resumes tracking | the gap is shown in history |
| Backend down | queue grows, retried | nothing false; history fills in later |
| Duplicate upload | same `clientId` | ignored by the server |
| Force stop (Android) | stays stopped until opened (Android rule) | "Unreachable", then "Unknown" |

## 11. Security model

- **Explicit enrollment** only: a parent with write access makes a 15-minute,
  single-use, 8-character code (40 bits, peppered hash stored); pairing is
  rate-limited per IP.
- **Device credential:** a 256-bit random token shown once to the native app,
  kept in the app's private storage, sent as a Bearer header; only its SHA-256 is
  stored. Rotation endpoint; revocation kills it at once.
- **Authorization:** every parent endpoint goes through `requireRoutineAccess`;
  device endpoints only ever touch their own device's child; Locate Now ids are
  checked against the child. Tutors (MENTOR) never reach location.
- **Least exposure:** the child sees his own log and status; co-parents see
  location but never the legacy link; pairing codes are shown once.
- **Audit:** views (at most one row per viewer per 10 min), Locate Now, pairing,
  revocation, retention purges, permission changes.
- **Retention:** points older than the child's retention (default 90 days,
  owner-settable 7–365) are deleted daily; Locate Now requests after 30 days;
  audit rows after 365 days.
- **Rate limits:** pairing 8/min/IP; device 30 requests/min; Locate Now one
  pending at a time and 20 an hour per child.
- **HTTPS only** (HSTS already set); release builds of the app refuse `http://`.
- **No stealth:** Android's permanent notification, iOS's location indicator, the
  status screen, and the parents' access log.

## 12. Production deployment requirements

- The additive Prisma migration runs on deploy (`npm run build`).
- Env on Vercel for Locate Now push (optional, each side independent):
  - Android/FCM: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`
    (a Firebase service account with the FCM role).
  - iOS/APNs: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (the .p8),
    `APNS_BUNDLE_ID`, `APNS_ENVIRONMENT` (`production` or `sandbox`).
- Android: `google-services.json` in `mobile/android/app/` for FCM; a release
  keystore; `ORBIT_SERVER_URL` in `mobile/www/config.js`.
- iOS: Xcode 16+, Apple Developer team, bundle ID, APNs key, Background Modes and
  Push capabilities, TestFlight.
- Vercel plan: the housekeeping runs inside the existing daily cron; an hourly
  schedule (Pro) makes silent-phone alerts timely.

## 13. Implementation order

1. Phase 1 — backend + web (this commit series): schema, device auth, pairing,
   uploads, heartbeat, Locate Now + push abstraction, status engine, history
   segmentation, parent Location tab, audit, retention, rate limits, tests
   (`scripts/check-devices.ts` simulates a phone end to end; `scripts/unit-location.ts`
   covers status and gap logic).
2. Phase 2 — Android app in `mobile/`, debug APK built on this Mac with JDK 21.
3. Phase 3 — iOS sources in `mobile/ios` (build on a Mac with Xcode).
4. Phase 4 — hardening items not covered above: error reporting, battery
   guidance screens, release signing, store/TestFlight distribution, privacy
   review, retiring the OwnTracks link and the web check-in once devices prove out.

### Per-phase checklist (asked for by the brief)

| Phase | Files | Database | APIs | Security | Tests | Deploy |
|---|---|---|---|---|---|---|
| 1 | `prisma/schema.prisma`, one migration; `lib/device-auth.ts`, `lib/device-status.ts`, `lib/device-push.ts`, `lib/location-track.ts`, `lib/location-audit.ts`, `lib/routine.ts`; `app/api/device/**`, `app/api/routine/devices/**`, `app/api/routine/location/**`, `app/api/cron/location-housekeeping`; `middleware.ts` (public `/api/device`); `components/routine/location-*.tsx`, `device-*.tsx`; `lib/hooks/use-routine.ts`, `lib/types.ts`, `lib/validation.ts` | 4 new tables, 9 new columns (all additive) | D1–D5, P1–P9, cron | token hashing, pairing codes, per-child authorization, audit, rate limits | unit script, device simulator rig, walkthrough | migration on deploy; optional FCM/APNs env |
| 2 | `mobile/**` (Android) | — | uses D1–D5 | token in private storage, HTTPS | debug APK build; emulator/device test list in `mobile/README.md` | APK signing; FCM json |
| 3 | `mobile/ios/**` | — | uses D1–D5 | Keychain for the token, HTTPS | Xcode build + TestFlight (not possible here) | Apple team, APNs key |
| 4 | docs, cron, UI | — | — | retention, revocation, alerts | rigs | Vercel env, cron schedule |

---

## Built — Phase 1 (2026-09-29, backend + web)

Done and proven on the local clone. Additive migration `20260929120000_child_devices`.

- **Schema:** `ChildDevice`, `DevicePairing`, `LocateRequest`, `LocationAuditEvent`;
  `LocationPoint` + `deviceId/clientId/receivedAt/altitude/speed/heading/isCharging/
  networkType/trigger` and unique `(deviceId, clientId)`; `Person.locationRetentionDays`.
- **Libraries:** `lib/device-auth.ts` (token hash, pairing codes, `requireDevice`,
  30/min), `lib/device-status.ts` (the 8 states + issues, pure), `lib/location-track.ts`
  (history segmentation/gaps, pure), `lib/device-push.ts` (FCM v1 + APNs, optional),
  `lib/device-service.ts` (pairing, ingest with idempotency, heartbeat + alerts,
  Locate Now, latest view, housekeeping), `lib/location-audit.ts`.
- **Device API:** `POST /api/device/{pair,locations,heartbeat,locate/[id]/status,
  token/rotate}` (public at the edge; each checks the phone's token/code).
- **Parent API:** `/api/routine/devices` (+ `/pairing`, `/[id]`),
  `/api/routine/location/{latest,locate,locate/[id],audit,settings}`; history view
  extended with `track` + device status; `/api/cron/location-housekeeping` (also run
  from the daily snooze-wake cron).
- **Web:** the parent's **Location** tab rebuilt — `location-now.tsx` (status,
  freshness, accuracy, battery, network, Locate Now step-by-step), `location-map.tsx`
  now has "current" (accuracy circle) and "history" (route only across continuous
  fixes, gaps dashed) modes, `location-log.tsx` a timeline with accuracy/late/gaps,
  `device-panel.tsx` (pairing, phones, retention, access log), the OwnTracks link
  folded into "Older ways". The child's screen says plainly when his phone shares
  automatically; the web-app ping is foreground-only and off once a phone is enrolled.
- **Tests:** `scripts/unit-location.ts` (38, pure), `scripts/check-devices.ts` (61,
  a simulated phone end to end), `.localdb/seed-device-demo.ts` (a lifelike phone for
  the dashboard). Evidence: `records/evidence/devices/`.
- **Not done here:** Phase 2 Android and Phase 3 iOS apps live in `mobile/` (built by
  separate agents; see `mobile/README.md` and `mobile/ios/README-ios.md`). Retiring
  the OwnTracks link and the web-app ping is Phase 4, once a real phone app is proven.
