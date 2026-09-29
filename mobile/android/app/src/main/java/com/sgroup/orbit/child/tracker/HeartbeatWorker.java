package com.sgroup.orbit.child.tracker;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.IOException;
import java.util.concurrent.TimeUnit;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * POST /api/device/heartbeat with the phone's own state (DeviceStatusIn).
 * Periodic every 15 minutes (Android's minimum; the OS picks the exact time),
 * plus one-off heartbeats for BOOT, SHUTDOWN, PERMISSION_CHANGED, APP_OPEN and
 * LOCATE_NOW. Each run also restarts the location service if it should be
 * running and is not, and picks up any Locate Now waiting on the server.
 */
public class HeartbeatWorker extends Worker {

    private static final String PERIODIC = "orbit-heartbeat";
    private static final String ONCE_PREFIX = "orbit-heartbeat-";
    private static final String KEY_EVENT = "event";

    public HeartbeatWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    private static Constraints connected() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    /** The 15-minute heartbeat. update=true when the server's heartbeatSeconds changed. */
    static void schedulePeriodic(Context ctx, boolean update) {
        long minutes = Math.max(15, TrackerStore.config(ctx).heartbeatSeconds / 60);
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(HeartbeatWorker.class, minutes, TimeUnit.MINUTES)
            .setConstraints(connected())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .addTag(TrackerCore.WORK_TAG)
            .build();
        try {
            WorkManager.getInstance(ctx.getApplicationContext()).enqueueUniquePeriodicWork(
                PERIODIC,
                update ? ExistingPeriodicWorkPolicy.UPDATE : ExistingPeriodicWorkPolicy.KEEP,
                req
            );
        } catch (RuntimeException e) {
            Log.w(TrackerCore.TAG, "Could not schedule the heartbeat", e);
        }
    }

    /** A one-off heartbeat as soon as there is a network. */
    static void sendSoon(Context ctx, String event) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(HeartbeatWorker.class)
            .setInputData(new Data.Builder().putString(KEY_EVENT, event).build())
            .setConstraints(connected())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(TrackerCore.WORK_TAG)
            .build();
        try {
            WorkManager.getInstance(ctx.getApplicationContext()).enqueueUniqueWork(ONCE_PREFIX + event, ExistingWorkPolicy.REPLACE, req);
        } catch (RuntimeException e) {
            Log.w(TrackerCore.TAG, "Could not schedule a heartbeat", e);
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        if (!TrackerStore.isPaired(ctx)) return Result.success();
        String event = getInputData().getString(KEY_EVENT);
        if (event == null) {
            event = TrackerCore.permissionsChangedSinceReport(ctx) ? "PERMISSION_CHANGED" : "PERIODIC";
        }
        // Restart sharing if it should be running and is not (Android may refuse
        // from the background; the refusal is shown in the app and reported).
        TrackerCore.ensureTracking(ctx, null);
        if (LocationQueue.get(ctx).count() > 0) UploadWorker.schedule(ctx, false);
        UploadWorker.Outcome o = send(ctx, event, Api.TIMEOUT_MS);
        return o == UploadWorker.Outcome.RETRY ? Result.retry() : Result.success();
    }

    /** Builds DeviceStatusIn. */
    static JSONObject status(Context ctx, String event) throws JSONException {
        JSONObject s = new JSONObject();
        s.put("permission", TrackerCore.permission(ctx));
        s.put("locationEnabled", TrackerCore.locationEnabled(ctx));
        s.put("trackingState", "SHUTDOWN".equals(event) ? "SHUTTING_DOWN" : TrackingService.currentState());
        Boolean precise = TrackerCore.preciseLocation(ctx);
        s.put("preciseLocation", precise == null ? JSONObject.NULL : precise);
        s.put("notificationsAllowed", TrackerCore.notificationsAllowed(ctx));
        s.put("batteryOptimized", TrackerCore.batteryOptimized(ctx));
        Integer battery = TrackerCore.batteryLevel(ctx);
        if (battery != null) s.put("batteryLevel", battery);
        Boolean charging = TrackerCore.isCharging(ctx);
        if (charging != null) s.put("isCharging", charging);
        s.put("networkType", TrackerCore.networkType(ctx));
        s.put("appVersion", clip(TrackerCore.appVersion(), 40));
        s.put("osVersion", clip(TrackerCore.osVersion(), 40));
        String push = TrackerStore.pushToken(ctx);
        if (push != null && TrackerCore.firebaseAvailable(ctx)) {
            s.put("pushProvider", "FCM");
            s.put("pushToken", push);
        }
        s.put("queueSize", LocationQueue.get(ctx).count());
        long shutdown = TrackerStore.lastShutdownAt(ctx);
        if (shutdown > 0) s.put("lastShutdownAt", TrackerStore.iso(shutdown));
        long booted = TrackerStore.bootedAt(ctx);
        if (booted > 0) s.put("bootedAt", TrackerStore.iso(booted));
        s.put("event", event);
        return s;
    }

    /** Sends one heartbeat now (blocking). Used by the worker, the app, and the shutdown receiver. */
    static UploadWorker.Outcome send(Context ctx, String event, int timeoutMs) {
        Context app = ctx.getApplicationContext();
        String server = TrackerStore.serverUrl(app);
        String token = TrackerStore.token(app);
        if (!TrackerStore.isPaired(app) || server == null || token == null) return UploadWorker.Outcome.NOT_PAIRED;
        String signature = TrackerCore.signature(app);
        JSONObject body;
        try {
            body = status(app, event);
        } catch (JSONException e) {
            return UploadWorker.Outcome.RETRY;
        }
        Api.Response res;
        try {
            res = Api.post(server, "/api/device/heartbeat", token, body, timeoutMs);
        } catch (IOException e) {
            Log.i(TrackerCore.TAG, "Heartbeat " + event + " not sent: " + e.getMessage());
            return UploadWorker.Outcome.RETRY;
        }
        if (res.ok()) {
            TrackerStore.setLastReportedSignature(app, signature);
            if (!"SHUTDOWN".equals(event)) UploadWorker.handleAnswer(app, res.json);
            TrackerCore.notifyChanged();
            return UploadWorker.Outcome.DONE;
        }
        if (res.isRevocation()) {
            TrackerCore.revoke(app);
            return UploadWorker.Outcome.REVOKED;
        }
        Log.w(TrackerCore.TAG, "Heartbeat " + event + " answered " + res.code + " " + res.errorCode());
        // 429 and server errors: try again later. A 400 would repeat forever, so give up on it.
        return res.code == 429 || res.code >= 500 ? UploadWorker.Outcome.RETRY : UploadWorker.Outcome.DONE;
    }

    static String clip(@Nullable String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max);
    }
}
