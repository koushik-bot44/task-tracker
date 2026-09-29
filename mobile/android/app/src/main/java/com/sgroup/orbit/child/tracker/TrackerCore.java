package com.sgroup.orbit.child.tracker;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;
import androidx.work.WorkManager;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.sgroup.orbit.child.BuildConfig;
import com.sgroup.orbit.child.MainActivity;
import com.sgroup.orbit.child.R;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The tracker's shared logic: what the phone allows, whether sharing should
 * run, the TrackerState handed to JavaScript, starting/stopping the service,
 * the sharing notification, and forgetting everything when the parent removes
 * the phone.
 */
public final class TrackerCore {

    static final String TAG = "OrbitChild";
    static final String CHANNEL_ID = "sharing";
    static final String WORK_TAG = "orbit";

    /** Implemented by the plugin to forward state changes to JavaScript. */
    interface Listener {
        void onTrackerStateChanged();
    }

    @Nullable
    private static volatile Listener listener;

    private TrackerCore() {}

    static void setListener(@Nullable Listener l) {
        listener = l;
    }

    static void clearListener(Listener l) {
        if (listener == l) listener = null;
    }

    /** Something changed: tell the app screen, if it is open. */
    static void notifyChanged() {
        Listener l = listener;
        if (l != null) {
            try {
                l.onTrackerStateChanged();
            } catch (RuntimeException e) {
                Log.w(TAG, "State listener failed", e);
            }
        }
    }

    // ---- what the phone allows ---------------------------------------------------

    static boolean granted(Context ctx, String permission) {
        return ContextCompat.checkSelfPermission(ctx, permission) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasForegroundLocation(Context ctx) {
        return granted(ctx, Manifest.permission.ACCESS_FINE_LOCATION) || granted(ctx, Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    /** "Allow all the time". Before Android 10 the foreground grant already covers the background. */
    static boolean hasBackgroundLocation(Context ctx) {
        if (!hasForegroundLocation(ctx)) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return granted(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION);
    }

    /** ALWAYS | WHILE_IN_USE | DENIED | NOT_DETERMINED */
    static String permission(Context ctx) {
        if (hasBackgroundLocation(ctx)) return "ALWAYS";
        if (hasForegroundLocation(ctx)) return "WHILE_IN_USE";
        return TrackerStore.wasAsked(ctx, "location") ? "DENIED" : "NOT_DETERMINED";
    }

    /** true = precise, false = approximate only, null = no location permission at all. */
    @Nullable
    static Boolean preciseLocation(Context ctx) {
        if (!hasForegroundLocation(ctx)) return null;
        return granted(ctx, Manifest.permission.ACCESS_FINE_LOCATION);
    }

    static boolean locationEnabled(Context ctx) {
        LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        return lm != null && LocationManagerCompat.isLocationEnabled(lm);
    }

    /** Notifications allowed for the app and the "sharing" channel not switched off. */
    static boolean notificationsAllowed(Context ctx) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            NotificationChannel ch = nm == null ? null : nm.getNotificationChannel(CHANNEL_ID);
            if (ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
        return true;
    }

    /** true when the app is NOT exempt from battery optimisation (Android may stop it). */
    static boolean batteryOptimized(Context ctx) {
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        return pm == null || !pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }

    @Nullable
    static Integer batteryLevel(Context ctx) {
        BatteryManager bm = (BatteryManager) ctx.getSystemService(Context.BATTERY_SERVICE);
        if (bm == null) return null;
        int v = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        return v >= 0 && v <= 100 ? v : null;
    }

    @Nullable
    static Boolean isCharging(Context ctx) {
        BatteryManager bm = (BatteryManager) ctx.getSystemService(Context.BATTERY_SERVICE);
        return bm == null ? null : bm.isCharging();
    }

    /** WIFI | CELLULAR | NONE | UNKNOWN */
    static String networkType(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return "UNKNOWN";
            Network n = cm.getActiveNetwork();
            if (n == null) return "NONE";
            NetworkCapabilities caps = cm.getNetworkCapabilities(n);
            if (caps == null) return "NONE";
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "WIFI";
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "CELLULAR";
            return "UNKNOWN";
        } catch (RuntimeException e) {
            return "UNKNOWN";
        }
    }

    static String appVersion() {
        return BuildConfig.VERSION_NAME;
    }

    static String osVersion() {
        return "Android " + Build.VERSION.RELEASE;
    }

    // ---- should sharing run? -----------------------------------------------------

    /** Null when sharing should run; otherwise the reason it cannot, in plain words. */
    @Nullable
    static String whyNotTracking(Context ctx) {
        if (!TrackerStore.isPaired(ctx)) {
            return TrackerStore.isRevoked(ctx) ? "This phone was removed from your family's Orbit." : "This phone isn't connected yet.";
        }
        if (!hasForegroundLocation(ctx)) return "Location permission is off.";
        if (!hasBackgroundLocation(ctx)) return "\"Allow all the time\" is off, so sharing can't run in the background.";
        if (!locationEnabled(ctx)) return "Location is switched off on this phone.";
        return null;
    }

    /** The hard conditions: without these a running service stops itself. */
    @Nullable
    static String whyServiceMustStop(Context ctx) {
        if (!TrackerStore.isPaired(ctx)) return "This phone isn't connected.";
        if (!hasBackgroundLocation(ctx)) return "\"Allow all the time\" is off.";
        return null;
    }

    /**
     * Starts the location service when everything it needs is allowed and it is
     * not running. Android 12+ refuses to start it from the background unless
     * the app is exempt (e.g. just booted, battery unrestricted, a high-priority
     * push); the refusal is recorded and shown, never worked around.
     */
    static void ensureTracking(Context ctx, @Nullable String startTrigger) {
        Context app = ctx.getApplicationContext();
        String why = whyNotTracking(app);
        if (why != null) {
            // Unpaired or no "Allow all the time": the service must not run.
            // Location merely switched off: a running service keeps running (its
            // notification says so) and resumes by itself when location returns.
            if (whyServiceMustStop(app) != null && TrackingService.isActive()) stopTracking(app);
            return;
        }
        if (TrackingService.isActive()) return;
        Intent i = new Intent(app, TrackingService.class);
        if (startTrigger != null) i.putExtra(TrackingService.EXTRA_TRIGGER, startTrigger);
        try {
            TrackingService.markStarting();
            ContextCompat.startForegroundService(app, i);
            TrackerStore.setLastStartError(app, null);
        } catch (RuntimeException e) {
            // ForegroundServiceStartNotAllowedException (Android 12+) or SecurityException.
            TrackingService.markStopped();
            TrackerStore.setLastStartError(app, "Android didn't let sharing start in the background. Open Orbit Child once to start it.");
            Log.w(TAG, "Could not start the tracking service", e);
        }
        notifyChanged();
    }

    static void stopTracking(Context ctx) {
        ctx.getApplicationContext().stopService(new Intent(ctx.getApplicationContext(), TrackingService.class));
    }

    /** Called when the server answers 401 DEVICE_REVOKED / DEVICE_UNAUTHORIZED. */
    static void revoke(Context ctx) {
        Context app = ctx.getApplicationContext();
        Log.w(TAG, "The server says this phone is no longer paired; clearing credentials and the queue");
        TrackerStore.clearCredentials(app);
        try {
            LocationQueue.get(app).clear();
        } catch (RuntimeException e) {
            Log.w(TAG, "Could not clear the queue", e);
        }
        stopTracking(app);
        try {
            WorkManager.getInstance(app).cancelAllWorkByTag(WORK_TAG);
        } catch (RuntimeException e) {
            Log.w(TAG, "Could not cancel work", e);
        }
        notifyChanged();
    }

    // ---- fixes ------------------------------------------------------------------

    /** Writes a real fix to the queue (with the phone's own time) and updates lastFixAt. */
    static String queueFix(Context ctx, Location loc, String trigger, @Nullable String locateRequestId) {
        Context app = ctx.getApplicationContext();
        String id = LocationQueue.get(app).insert(loc, trigger, locateRequestId, batteryLevel(app), isCharging(app), networkType(app));
        TrackerStore.setLastFixAt(app, loc.getTime());
        notifyChanged();
        return id;
    }

    // ---- permission-change reporting --------------------------------------------

    /** What the parent is told about permissions; a change triggers a PERMISSION_CHANGED heartbeat. */
    static String signature(Context ctx) {
        return (
            permission(ctx) +
            "|" +
            preciseLocation(ctx) +
            "|" +
            locationEnabled(ctx) +
            "|" +
            notificationsAllowed(ctx) +
            "|" +
            batteryOptimized(ctx)
        );
    }

    static boolean permissionsChangedSinceReport(Context ctx) {
        String last = TrackerStore.lastReportedSignature(ctx);
        return last != null && !last.equals(signature(ctx));
    }

    /** Compares with the last reported state and, if different, reports it soon. */
    static void reportIfPermissionsChanged(Context ctx) {
        if (!TrackerStore.isPaired(ctx)) return;
        if (permissionsChangedSinceReport(ctx)) HeartbeatWorker.sendSoon(ctx, "PERMISSION_CHANGED");
    }

    // ---- TrackerState for JavaScript ---------------------------------------------

    static JSONObject state(Context ctx) {
        Context app = ctx.getApplicationContext();
        JSONObject s = new JSONObject();
        try {
            boolean paired = TrackerStore.isPaired(app);
            s.put("platform", "android");
            s.put("paired", paired);
            s.put("revoked", TrackerStore.isRevoked(app));
            putOpt(s, "serverUrl", TrackerStore.serverUrl(app));
            if (paired) {
                putOpt(s, "deviceId", TrackerStore.deviceId(app));
                putOpt(s, "personName", TrackerStore.personName(app));
            }
            s.put("permission", permission(app));
            Boolean precise = preciseLocation(app);
            s.put("preciseLocation", precise == null ? JSONObject.NULL : precise);
            s.put("locationEnabled", locationEnabled(app));
            s.put("notificationsAllowed", notificationsAllowed(app));
            s.put("batteryOptimized", batteryOptimized(app));
            String tracking = TrackingService.currentState();
            s.put("trackingState", tracking);
            if (!"RUNNING".equals(tracking)) {
                String why = whyNotTracking(app);
                if (why == null && "STOPPED".equals(tracking)) why = TrackerStore.lastStartError(app);
                putOpt(s, "trackingStoppedReason", why);
            }
            long fix = TrackerStore.lastFixAt(app);
            if (fix > 0) s.put("lastFixAt", TrackerStore.iso(fix));
            long up = TrackerStore.lastUploadAt(app);
            if (up > 0) s.put("lastUploadAt", TrackerStore.iso(up));
            putOpt(s, "lastUploadError", TrackerStore.lastUploadError(app));
            s.put("queueSize", LocationQueue.get(app).count());
        } catch (JSONException e) {
            Log.w(TAG, "Could not build state", e);
        }
        return s;
    }

    private static void putOpt(JSONObject o, String k, @Nullable String v) throws JSONException {
        if (v != null) o.put(k, v);
    }

    /** A string field of a server answer, or null when missing / JSON null / empty. */
    @Nullable
    static String str(@Nullable JSONObject o, String key) {
        if (o == null || !o.has(key) || o.isNull(key)) return null;
        String v = o.optString(key, "");
        return v.isEmpty() ? null : v;
    }

    // ---- notification --------------------------------------------------------------

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Location sharing", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Shown the whole time this phone shares its location with your family.");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    /** The permanent "Sharing location with your family" notice; tapping it opens the app. */
    static Notification sharingNotification(Context ctx, String text) {
        ensureChannel(ctx);
        Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_sharing)
            .setContentTitle("Sharing location with your family")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    static String sharingText(Context ctx) {
        if (!locationEnabled(ctx)) return "Location is switched off on this phone, so nothing new is shared. Tap to open Orbit Child.";
        return "Orbit Child is on. Your family can see where this phone is. Tap to open.";
    }

    // ---- FCM (optional) -------------------------------------------------------------

    /** True when google-services.json was built in and Firebase started. */
    static boolean firebaseAvailable(Context ctx) {
        try {
            return !FirebaseApp.getApps(ctx.getApplicationContext()).isEmpty();
        } catch (Throwable t) {
            return false;
        }
    }

    /** Fetches the FCM token (if FCM is set up) and reports it at the next heartbeat. */
    static void refreshPushToken(Context ctx) {
        final Context app = ctx.getApplicationContext();
        if (!firebaseAvailable(app)) return;
        try {
            FirebaseMessaging.getInstance()
                .getToken()
                .addOnCompleteListener(task -> {
                    if (!task.isSuccessful()) {
                        Log.w(TAG, "FCM token not available", task.getException());
                        return;
                    }
                    String token = task.getResult();
                    if (token != null && TrackerStore.setPushToken(app, token) && TrackerStore.isPaired(app)) {
                        HeartbeatWorker.sendSoon(app, "PERIODIC");
                    }
                });
        } catch (Throwable t) {
            Log.w(TAG, "FCM unavailable", t);
        }
    }
}
