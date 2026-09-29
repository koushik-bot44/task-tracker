package com.sgroup.orbit.child.tracker;

import android.annotation.SuppressLint;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/**
 * The location service. A foreground service of type "location" with a
 * permanent "Sharing location with your family" notification: it cannot run
 * hidden, and it does not try to.
 *
 * ADAPTIVE strategy (records/plans/device-tracking-plan.md, section 6):
 *  - STILL: balanced power, one fix per stationaryIntervalSeconds (default 15 min).
 *    A fix that arrives sooner (e.g. shared from another app's request) is kept
 *    only if the phone moved at least distanceFilterMeters (default 50 m).
 *  - MOVING: entered when a fix shows speed > 1.5 m/s (the fix's own speed, or
 *    the distance from the previous fix over the time between them, counted
 *    only beyond the fixes' accuracy radii). High accuracy every
 *    movingIntervalSeconds (default 2 min).
 *  - Back to STILL after 10 minutes without movement.
 * Android decides the exact timing; nothing here promises "every N minutes".
 *
 * Every kept fix goes into {@link LocationQueue} first, then an upload is
 * scheduled. Positions and times are the OS's own; none are invented.
 */
public class TrackingService extends Service {

    static final String EXTRA_TRIGGER = "trigger";
    static final int NOTIFICATION_ID = 7301;

    private static final float MOVING_SPEED_MPS = 1.5f;
    private static final long STILL_AFTER_MS = 10 * 60 * 1000L;
    private static final long STILL_CHECK_MS = 60 * 1000L;

    private static volatile String state = "STOPPED";

    @Nullable
    private static volatile TrackingService instance;

    /** RUNNING | STARTING | STOPPED */
    static String currentState() {
        return state;
    }

    static boolean isActive() {
        return !"STOPPED".equals(state);
    }

    static void markStarting() {
        if ("STOPPED".equals(state)) state = "STARTING";
    }

    static void markStopped() {
        state = "STOPPED";
    }

    /** The server's intervals changed: re-request location updates. */
    static void reconfigure() {
        TrackingService s = instance;
        if (s != null && s.handler != null) s.handler.post(s::requestUpdates);
    }

    private HandlerThread thread;
    private Handler handler;
    private FusedLocationProviderClient client;

    private boolean moving;
    private long lastMovementAt;

    @Nullable
    private Location lastSeen;

    @Nullable
    private Location lastStored;

    @Nullable
    private String pendingTrigger;

    @Nullable
    private BroadcastReceiver providersReceiver;

    @Nullable
    private ShutdownReceiver shutdownReceiver;

    private final LocationCallback callback = new LocationCallback() {
        @Override
        public void onLocationResult(@NonNull LocationResult result) {
            for (Location l : result.getLocations()) handleFix(l);
        }
    };

    private final Runnable stillCheck = new Runnable() {
        @Override
        public void run() {
            if (!moving) return;
            if (System.currentTimeMillis() - lastMovementAt >= STILL_AFTER_MS) {
                moving = false;
                requestUpdates();
            } else {
                handler.postDelayed(this, STILL_CHECK_MS);
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        thread = new HandlerThread("orbit-tracker");
        thread.start();
        handler = new Handler(thread.getLooper());
        client = LocationServices.getFusedLocationProviderClient(this);

        // Location switched on/off: update the notice and tell the parent.
        providersReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                updateNotification();
                TrackerCore.reportIfPermissionsChanged(context);
                TrackerCore.notifyChanged();
            }
        };
        ContextCompat.registerReceiver(
            this,
            providersReceiver,
            new IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
        // The manifest receiver may not get ACTION_SHUTDOWN on every Android
        // version; a receiver registered by the running service always does.
        shutdownReceiver = new ShutdownReceiver();
        ContextCompat.registerReceiver(this, shutdownReceiver, new IntentFilter(Intent.ACTION_SHUTDOWN), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @SuppressLint("InlinedApi") // ServiceCompat drops the type below Android 10
    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        // startForeground first, always: Android requires it after
        // startForegroundService, and the notice must be up before any fix.
        try {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                TrackerCore.sharingNotification(this, TrackerCore.sharingText(this)),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            );
        } catch (RuntimeException e) {
            Log.w(TrackerCore.TAG, "startForeground refused", e);
            TrackerStore.setLastStartError(this, "Android didn't let sharing start. Open Orbit Child to start it.");
            shutDown();
            return START_NOT_STICKY;
        }
        String why = TrackerCore.whyServiceMustStop(this);
        if (why != null) {
            Log.i(TrackerCore.TAG, "Tracking not allowed: " + why);
            shutDown();
            return START_NOT_STICKY;
        }
        if (intent != null && intent.hasExtra(EXTRA_TRIGGER)) pendingTrigger = intent.getStringExtra(EXTRA_TRIGGER);
        state = "RUNNING";
        TrackerStore.setLastStartError(this, null);
        handler.post(this::requestUpdates);
        TrackerCore.notifyChanged();
        return START_STICKY;
    }

    private void shutDown() {
        state = "STOPPED";
        try {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        } catch (RuntimeException ignored) {}
        stopSelf();
        TrackerCore.notifyChanged();
    }

    @SuppressLint("MissingPermission") // checked just above the request
    private void requestUpdates() {
        if (!TrackerCore.hasForegroundLocation(this)) {
            shutDown();
            return;
        }
        TrackerStore.Config cfg = TrackerStore.config(this);
        LocationRequest req;
        if (moving) {
            long interval = cfg.movingIntervalSeconds * 1000L;
            req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval)
                .setMinUpdateIntervalMillis(interval / 2)
                .setWaitForAccurateLocation(false)
                .build();
        } else {
            long interval = cfg.stationaryIntervalSeconds * 1000L;
            req = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, interval)
                .setMinUpdateIntervalMillis(Math.min(60_000L, interval))
                .setWaitForAccurateLocation(false)
                .build();
        }
        try {
            client.removeLocationUpdates(callback);
            client
                .requestLocationUpdates(req, callback, handler.getLooper())
                .addOnFailureListener(e -> Log.w(TrackerCore.TAG, "Location updates refused", e));
        } catch (SecurityException e) {
            Log.w(TrackerCore.TAG, "Location permission lost", e);
            shutDown();
            return;
        }
        handler.removeCallbacks(stillCheck);
        if (moving) handler.postDelayed(stillCheck, STILL_CHECK_MS);
        Log.i(TrackerCore.TAG, "Location updates: " + (moving ? "MOVING" : "STILL"));
    }

    /** Runs on the tracker thread for every fix the OS delivers. */
    private void handleFix(Location l) {
        long t = l.getTime();
        if (t <= 0) return; // no time from the OS: never invent one
        Location prev = lastSeen;
        lastSeen = l;
        // Already have something at least this new (e.g. a cached fix redelivered after a restart).
        if (t <= TrackerStore.lastFixAt(this)) return;

        TrackerStore.Config cfg = TrackerStore.config(this);
        long now = System.currentTimeMillis();
        if (speedOf(l, prev) > MOVING_SPEED_MPS) {
            lastMovementAt = now;
            if (!moving) {
                moving = true;
                requestUpdates();
            }
        } else if (moving && now - lastMovementAt >= STILL_AFTER_MS) {
            moving = false;
            requestUpdates();
        }

        long intervalMs = (moving ? cfg.movingIntervalSeconds : cfg.stationaryIntervalSeconds) * 1000L;
        Location stored = lastStored;
        boolean keep = stored == null || stored.distanceTo(l) >= cfg.distanceFilterMeters || t - stored.getTime() >= (intervalMs * 9) / 10;
        if (!keep) return;

        String trigger = pendingTrigger != null ? pendingTrigger : (moving ? "MOTION" : "BACKGROUND");
        pendingTrigger = null;
        try {
            TrackerCore.queueFix(this, l, trigger, null);
            lastStored = l;
            UploadWorker.schedule(this, false);
        } catch (RuntimeException e) {
            Log.w(TrackerCore.TAG, "Could not queue a fix", e);
        }
    }

    /** m/s: the fix's own speed, else distance over time from the previous fix beyond their accuracy. */
    private static float speedOf(Location l, @Nullable Location prev) {
        if (l.hasSpeed()) return l.getSpeed();
        if (prev == null) return 0f;
        long dt = l.getTime() - prev.getTime();
        if (dt <= 0) return 0f;
        float d = prev.distanceTo(l);
        float noise = Math.max(prev.hasAccuracy() ? prev.getAccuracy() : 0f, l.hasAccuracy() ? l.getAccuracy() : 0f);
        if (d <= noise) return 0f;
        return d / (dt / 1000f);
    }

    @SuppressLint("MissingPermission") // guarded by areNotificationsEnabled()
    private void updateNotification() {
        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(this);
            if (nm.areNotificationsEnabled()) {
                nm.notify(NOTIFICATION_ID, TrackerCore.sharingNotification(this, TrackerCore.sharingText(this)));
            }
        } catch (RuntimeException e) {
            Log.w(TrackerCore.TAG, "Could not update the notification", e);
        }
    }

    @Override
    public void onDestroy() {
        state = "STOPPED";
        instance = null;
        try {
            client.removeLocationUpdates(callback);
        } catch (RuntimeException ignored) {}
        handler.removeCallbacksAndMessages(null);
        if (providersReceiver != null) unregisterSafely(providersReceiver);
        if (shutdownReceiver != null) unregisterSafely(shutdownReceiver);
        thread.quitSafely();
        TrackerCore.notifyChanged();
        super.onDestroy();
    }

    private void unregisterSafely(BroadcastReceiver r) {
        try {
            unregisterReceiver(r);
        } catch (RuntimeException ignored) {}
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
