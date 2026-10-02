# Orbit Child — the phone app

Orbit Child shares a child's location with the family **automatically, in the
background**, after an explicit pairing with a code from the parent's Orbit screen
and the phone's own permissions. It is a Capacitor 8 shell (`www/`, plain
HTML/JS) around a native plugin, `ChildTracker`, that owns the credentials, the
queue, the location service and all networking. The API it talks to is section 5
of `records/plans/device-tracking-plan.md`.

## What it does

- **Pairing:** the child (with the parent next to them) types the family's Orbit
  address and the 8-letter code from *Well Being → Location → Add a phone*. The
  phone gets its own device token, kept in the app's private storage. The token
  is never handed to JavaScript, never backed up, and never sent anywhere but
  the paired address. Redirects are not followed.
- **Permission checklist**, one step at a time, each explained on screen:
  location while in use → *Allow all the time* → notifications → battery
  (*Don't restrict*). Every change is reported to the parent.
- **Background sharing:** a foreground service (type `location`) with a
  permanent notification, *"Sharing location with your family"*. Fixes come
  from Google's fused location provider, using an adaptive strategy:
  - **Still:** balanced power, one fix per 15 minutes. A fix that arrives sooner
    is kept only if the phone moved at least 50 m.
  - **Moving:** high accuracy every 2 minutes, once a fix shows more than
    1.5 m/s. It drops back to *still* after 10 minutes without movement.
  - The server can change these intervals (`config` in every answer).
    Android decides the exact timing.
- **Offline-safe:** every fix is written to a SQLite queue first and uploaded
  when there is a network. Each fix has a UUID `clientId`, so a retried upload
  is never counted twice. Each point keeps the phone's own fix time
  (`recordedAt`); the server also records when it arrived.
- **Heartbeat** every 15 minutes (Android's minimum). It reports permission,
  precise/approximate, location switch, whether sharing is running,
  notifications, battery optimisation, battery %, charging, network, queue
  size, boot and shutdown times. It also restarts sharing if it died and
  Android allows the restart.
- **Locate Now:** answered instantly through FCM when it is set up. Otherwise
  it is answered at the next heartbeat or upload. The phone acknowledges the
  request, takes one fresh high-accuracy fix and uploads it at once. If it
  can't, it answers with an honest reason: `PERMISSION_DENIED`,
  `LOCATION_DISABLED`, `TIMEOUT` or `UNAVAILABLE`.
- **Restart and update:** sharing resumes after a reboot (`BOOT_COMPLETED`) or
  an app update (`MY_PACKAGE_REPLACED`). A best-effort *shutdown* ping is sent
  when the phone powers off.
- **Removal:** when the parent removes the phone, the server answers
  `401 DEVICE_REVOKED`. The app then forgets its credentials, empties its
  queue, stops sharing and shows *"This phone was removed"*.

## What it does not do (on purpose)

- No hidden mode and no hidden notification. There is no "stop" button either:
  removal is done by the parent, or by uninstalling, which the parent sees as
  the phone going silent.
- No attempt to survive **Force Stop**. A force-stopped app stays stopped until
  it is opened again (Android's rule).
- No permission bypass and no collection without *Allow all the time*.
- No invented positions or times. If there is no fix, nothing is sent except
  the heartbeat that says so.
- No manual check-ins as the main path.

## Build (Android)

Requirements on this Mac:

```sh
export JAVA_HOME=$HOME/.local/jdk-21/Contents/Home        # JDK 21 (Gradle 8.14 cannot run on Java 25)
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk          # platforms 35/36, build-tools 35.0.0
```

```sh
cd mobile
npm install                 # once
npx cap sync android        # after every change in www/ (copies it into the app)
cd android
./gradlew assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:lintDebug    # optional → app/build/reports/lint-results-debug.html
```

Install on a phone with USB debugging: `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

**Release build.** Create a keystore once and keep it safe; losing it means
you can never ship an update:

```sh
keytool -genkeypair -v -keystore orbit-child.jks -alias orbit-child -keyalg RSA -keysize 4096 -validity 10000
```

Then create `mobile/android/keystore.properties`. It is git-ignored, as are
`*.jks` and `*.keystore`:

```properties
storeFile=orbit-child.jks
storePassword=…
keyAlias=orbit-child
keyPassword=…
```

`storeFile` is relative to `mobile/android/`. Then run
`./gradlew assembleRelease` to get `app/build/outputs/apk/release/app-release.apk`.
Without `keystore.properties` the release APK comes out unsigned.

If the app goes on Google Play (rather than a sideloaded APK), Play asks for a
declaration for several things this app uses: background location, the
`location` foreground service type, and the direct battery-optimisation
request. Each needs a short video of the in-app explanation.

**http vs https.** Release builds refuse any address that isn't `https://`,
both in code and through the network security config. Only the debug build
allows plain `http://`, for a local server: `http://10.0.2.2:3010` from the
emulator, or the Mac's LAN address from a phone on the same Wi-Fi. That comes
from the debug-only `src/debug/res/xml/network_security_config.xml` and a
manifest placeholder.

## Setting the server address

Edit `mobile/www/config.js`:

```js
window.ORBIT_CONFIG = { serverUrl: "https://orbit.example.com" };
```

Then run `npx cap sync android` and rebuild. With an address built in, the
pairing screen asks for the 8-letter code only (2026-10-02); "Use a different
Orbit address" shows the address box for development. If no scheme is typed,
the app adds `https://`. The live site's address is built in now.

## FCM (instant Locate Now) — optional

Without FCM everything works. Locate Now is just answered at the phone's next
heartbeat or upload, up to about 15 minutes later, and the parent screen shows
it as waiting.

To set FCM up:

1. In the Firebase console, create a project (or use an existing one) and add
   an Android app with package `com.sgroup.orbit.child`.
2. Download `google-services.json` into `mobile/android/app/`. The Gradle build
   applies the google-services plugin only when that file exists. Then rebuild.
   The phone reports its FCM token in the next heartbeat.
3. On the server (Vercel env), from a Firebase service account allowed to send
   FCM (Project settings → Service accounts → Generate new private key):
   - `FCM_PROJECT_ID`: the Firebase project id
   - `FCM_CLIENT_EMAIL`: the service account's `client_email`
   - `FCM_PRIVATE_KEY`: its `private_key`, the whole PEM; `\n` escapes are fine

The server sends a high-priority data message,
`{type: "LOCATE_NOW", requestId}`, which `LocateNowMessagingService` handles.

## Code map

`android/app/src/main/java/com/sgroup/orbit/child/`

| File | Job |
|---|---|
| `MainActivity.java` | registers the `ChildTracker` plugin before the bridge starts |
| `tracker/ChildTrackerPlugin.java` | the JS-visible methods and the `stateChange` event |
| `tracker/TrackerCore.java` | permission and phone state, TrackerState, start/stop, notification, revocation |
| `tracker/TrackerStore.java` | private SharedPreferences: credentials, config, times |
| `tracker/Api.java` | HttpURLConnection + org.json, Bearer token, 15 s timeouts, no redirects |
| `tracker/LocationQueue.java` | SQLite queue of real fixes |
| `tracker/TrackingService.java` | foreground location service, adaptive strategy |
| `tracker/UploadWorker.java` | WorkManager upload of the queue (unique, network, backoff) |
| `tracker/HeartbeatWorker.java` | 15-min heartbeat and one-off events |
| `tracker/LocateWorker.java`, `Fixes.java` | Locate Now and one fresh fix |
| `tracker/LocateNowMessagingService.java` | FCM data messages and token refresh |
| `tracker/BootReceiver.java`, `ShutdownReceiver.java` | reboot/update and power-off |

**JS API** (`Capacitor.registerPlugin("ChildTracker")`): `getState`,
`pair({serverUrl, code})`, `requestForegroundPermission`,
`requestBackgroundPermission`, `requestNotificationPermission`,
`requestBatteryExemption`, `openAppSettings`, `openLocationSettings`,
`startTracking` and `sendNow`. Each resolves to a `TrackerState`, and changes
also arrive as the `stateChange` event. On Android the state also carries
`trackingStoppedReason`, a plain-words reason whenever sharing is not running.

## Manual test checklist (real Android phone)

Build the debug APK against a reachable server, have a parent account with a
child in Well Being, and keep the parent's **Location** tab open on a laptop.

1. **Pair.**
   - A wrong code gives *"That code didn't work. Ask your parent for a new one."*
   - Nine quick wrong tries give *"Too many tries…"*.
   - A wrong address gives *"Can't reach …"*.
   - The right code shows "Hi <name>", and the phone appears under *Phones*.
2. **Location while in use.** Tap *Allow location*.
   - Try *Approximate* first: the *Precise location* step turns red and the
     parent sees the issue.
   - Then allow precise.
3. **Allow all the time.** Tap *Open settings*, then Permissions → Location →
   *Allow all the time*, then Back.
   - Sharing starts by itself.
   - The notification *"Sharing location with your family"* appears and can't
     be swiped away.
   - The parent sees the status go *Live*.
4. **Notifications** (Android 13+). Deny once, then allow from the button.
   The parent sees the change.
5. **Battery.** Tap *Don't restrict* and accept the system dialog. The step
   turns green.
6. **Lock screen for 30 minutes**, with some of it walking or driving if you
   can. The parent's history shows points every 2 min while moving and about
   every 15 min while still. Nothing is invented during gaps.
7. **Swipe the app away from Recents.** The notification stays and points keep
   arriving. Some OEMs kill it anyway: the parent then sees *Phone unreachable*
   after 35 min.
8. **Reboot the phone** and don't open the app.
   - Sharing resumes by itself.
   - The parent sees *Switched off at …* and then *Live*.
   - The history shows the gap.
9. **Airplane mode for 20 minutes, then off.**
   - While offline, *Waiting to send* grows on the phone and the parent sees
     *Unreachable*.
   - Afterwards the points arrive, marked *arrived later*, with no duplicates.
10. **Switch location off** in quick settings.
    - The notification says so.
    - The parent gets *Location off* within a heartbeat, or at once while the
      service runs.
    - Switch it back on: points resume.
11. **Revoke permission** (Settings → Apps → Orbit Child → Location → *Don't
    allow*). The parent sees *Permission off* at the next heartbeat. Allow it
    again and open the app: sharing restarts.
12. **Locate Now without FCM.** Press it on the parent screen. It shows as
    waiting, then is answered within about 15 min (next heartbeat), or at once
    if you tap *Send my location now* on the phone.
13. **Locate Now with FCM** (after `google-services.json` and the server env
    vars). It is answered within seconds, even with the screen locked. With
    location off, it answers *Location is off on the phone*.
14. **Battery saver on**, then repeat 6 and 12. Expect fewer, later fixes; that
    is Android's choice. Nothing must be faked.
15. **Force stop** (Settings → Apps → Orbit Child → Force stop). Sharing stops
    until the app is opened: that is Android's rule. The parent sees
    *Unreachable*, then *Unknown*.
16. **Remove the phone** on the parent's *Phones* list. At its next contact the
    phone shows *"This phone was removed…"*, its notification disappears and
    its queue is emptied.

## iOS

See mobile/ios/README-ios.md
