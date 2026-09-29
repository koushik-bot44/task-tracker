package com.sgroup.orbit.child.tracker;

import android.content.Context;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.ForegroundInfo;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Locate Now. For each pending request id: POST .../locate/{id}/status
 * DELIVERED, take one fresh high-accuracy fix (locateTimeoutSeconds), queue it
 * with trigger LOCATE_NOW and the request id, and upload at once. When there
 * is no permission, location is off, or no fix arrives in time, it answers
 * FAILED with PERMISSION_DENIED / LOCATION_DISABLED / TIMEOUT / UNAVAILABLE.
 *
 * Requests arrive from an FCM data message (instant, when FCM is set up) or in
 * the answer to an upload or heartbeat (without FCM). Each id is taken once.
 */
public class LocateWorker extends Worker {

    private static final String UNIQUE = "orbit-locate";
    private static final String KEY_IDS = "ids";
    private static final int NOTIFICATION_ID = 7302;

    public LocateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** From a server answer: [{ id, requestedAt, expiresAt }, …] */
    static void enqueue(Context ctx, JSONArray pending) {
        List<String> ids = new ArrayList<>();
        long now = System.currentTimeMillis();
        for (int i = 0; i < pending.length(); i++) {
            JSONObject o = pending.optJSONObject(i);
            String id = o != null ? TrackerCore.str(o, "id") : pending.optString(i, null);
            if (id == null || id.isEmpty()) continue;
            long expires = o != null ? TrackerStore.parseIso(TrackerCore.str(o, "expiresAt")) : -1;
            if (expires > 0 && expires < now) continue; // already expired on the server
            ids.add(id);
        }
        enqueueIds(ctx, ids);
    }

    static void enqueueIds(Context ctx, List<String> ids) {
        List<String> fresh = new ArrayList<>();
        for (String id : ids) if (TrackerStore.claimLocateRequest(ctx, id)) fresh.add(id);
        if (fresh.isEmpty()) return;
        Log.i(TrackerCore.TAG, "Locate Now requested: " + fresh);
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(LocateWorker.class)
            .setInputData(new Data.Builder().putStringArray(KEY_IDS, fresh.toArray(new String[0])).build())
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.NOT_REQUIRED).build())
            .addTag(TrackerCore.WORK_TAG)
            .build();
        try {
            WorkManager.getInstance(ctx.getApplicationContext()).enqueueUniqueWork(UNIQUE, ExistingWorkPolicy.APPEND_OR_REPLACE, req);
        } catch (RuntimeException e) {
            Log.w(TrackerCore.TAG, "Could not schedule Locate Now", e);
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        String[] ids = getInputData().getStringArray(KEY_IDS);
        if (ids == null || !TrackerStore.isPaired(ctx)) return Result.success();
        boolean queued = false;
        for (String id : ids) {
            if (!TrackerStore.isPaired(ctx)) break;
            queued |= handle(ctx, id);
        }
        if (queued) {
            UploadWorker.Outcome o = UploadWorker.flush(ctx);
            if (o == UploadWorker.Outcome.RETRY) UploadWorker.schedule(ctx, true);
        }
        return Result.success();
    }

    /** Answers one request; returns true when a fix was queued. Blocking. */
    static boolean handle(Context ctx, String id) {
        postStatus(ctx, id, "DELIVERED", null, null);
        int timeout = TrackerStore.config(ctx).locateTimeoutSeconds;
        try {
            Location l = Fixes.fresh(ctx, timeout, true);
            TrackerCore.queueFix(ctx, l, "LOCATE_NOW", id);
            return true;
        } catch (Fixes.NoFix e) {
            Log.w(TrackerCore.TAG, "Locate Now " + id + " failed: " + e.reason);
            postStatus(ctx, id, "FAILED", e.reason, e.getMessage());
            return false;
        } catch (RuntimeException e) {
            Log.w(TrackerCore.TAG, "Locate Now " + id + " failed", e);
            postStatus(ctx, id, "FAILED", "UNAVAILABLE", "The phone couldn't get a position right now.");
            return false;
        }
    }

    private static void postStatus(Context ctx, String id, String status, @Nullable String reason, @Nullable String detail) {
        String server = TrackerStore.serverUrl(ctx);
        String token = TrackerStore.token(ctx);
        if (server == null || token == null) return;
        JSONObject body = new JSONObject();
        try {
            body.put("status", status);
            if (reason != null) body.put("reason", reason);
            if (detail != null) body.put("detail", HeartbeatWorker.clip(detail, 200));
        } catch (JSONException e) {
            return;
        }
        try {
            Api.Response res = Api.post(server, "/api/device/locate/" + android.net.Uri.encode(id) + "/status", token, body);
            if (res.isRevocation()) TrackerCore.revoke(ctx);
            else if (!res.ok()) Log.w(TrackerCore.TAG, "Locate status " + status + " answered " + res.code);
        } catch (IOException e) {
            // No internet: the fix (if any) still carries the request id and
            // settles the request when it uploads.
            Log.i(TrackerCore.TAG, "Locate status " + status + " not sent: " + e.getMessage());
        }
    }

    @NonNull
    @Override
    public ForegroundInfo getForegroundInfo() {
        return foregroundInfo(getApplicationContext(), "Your family asked where this phone is. Sending it now.");
    }

    /** The visible notice shown while expedited work runs as a foreground service (Android 11 and older). */
    static ForegroundInfo foregroundInfo(Context ctx, String text) {
        TrackerCore.ensureChannel(ctx);
        android.app.Notification n = new androidx.core.app.NotificationCompat.Builder(ctx, TrackerCore.CHANNEL_ID)
            .setSmallIcon(com.sgroup.orbit.child.R.drawable.ic_stat_sharing)
            .setContentTitle("Sharing location with your family")
            .setContentText(text)
            .setOngoing(true)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return new ForegroundInfo(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        }
        return new ForegroundInfo(NOTIFICATION_ID, n);
    }
}
