package com.sgroup.orbit.child.tracker;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
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
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Sends the queue to POST /api/device/locations, up to maxBatch points at a
 * time. A 200 settles every point in the batch (the server counts each as
 * accepted, duplicate, or rejected for good with a reason), so those rows are
 * deleted; rejected ones are logged. 401 DEVICE_REVOKED / DEVICE_UNAUTHORIZED
 * forgets the pairing; 429 and network or server errors retry with backoff.
 */
public class UploadWorker extends Worker {

    static final String UNIQUE = "orbit-upload";
    private static final String UNIQUE_EXPEDITED = "orbit-upload-now";
    /** Stay under the server's 30 requests a minute per device. */
    private static final int MAX_BATCHES_PER_RUN = 20;
    private static final Object LOCK = new Object();

    enum Outcome {
        DONE,
        RETRY,
        REVOKED,
        NOT_PAIRED,
    }

    public UploadWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Schedules an upload when there is a network. Expedited for Locate Now. */
    static void schedule(Context ctx, boolean expedited) {
        OneTimeWorkRequest.Builder b = new OneTimeWorkRequest.Builder(UploadWorker.class)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(TrackerCore.WORK_TAG);
        try {
            WorkManager wm = WorkManager.getInstance(ctx.getApplicationContext());
            if (expedited) {
                b.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST);
                wm.enqueueUniqueWork(UNIQUE_EXPEDITED, ExistingWorkPolicy.REPLACE, b.build());
            } else {
                // KEEP: a pending upload already sends everything queued by the time it runs.
                wm.enqueueUniqueWork(UNIQUE, ExistingWorkPolicy.KEEP, b.build());
            }
        } catch (RuntimeException e) {
            Log.w(TrackerCore.TAG, "Could not schedule an upload", e);
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        Outcome o = flush(getApplicationContext());
        return o == Outcome.RETRY ? Result.retry() : Result.success();
    }

    /** Needed for expedited work on Android 11 and older, where it runs as a short foreground service. */
    @NonNull
    @Override
    public ForegroundInfo getForegroundInfo() {
        return LocateWorker.foregroundInfo(getApplicationContext(), "Sending your location to your family");
    }

    /** Sends everything queued, batch by batch. Safe to call from any background thread. */
    static Outcome flush(Context ctx) {
        Context app = ctx.getApplicationContext();
        synchronized (LOCK) {
            if (!TrackerStore.isPaired(app)) return Outcome.NOT_PAIRED;
            LocationQueue q = LocationQueue.get(app);
            try {
                q.prune();
            } catch (RuntimeException e) {
                Log.w(TrackerCore.TAG, "Queue prune failed", e);
            }
            for (int batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
                String server = TrackerStore.serverUrl(app);
                String token = TrackerStore.token(app);
                if (server == null || token == null) return Outcome.NOT_PAIRED;
                TrackerStore.Config cfg = TrackerStore.config(app);
                List<LocationQueue.Row> rows = q.oldest(cfg.maxBatch);
                if (rows.isEmpty()) {
                    TrackerCore.notifyChanged();
                    return Outcome.DONE;
                }
                JSONArray points = new JSONArray();
                List<String> sent = new ArrayList<>();
                for (LocationQueue.Row r : rows) {
                    points.put(r.json);
                    sent.add(r.clientId);
                }
                JSONObject body = new JSONObject();
                try {
                    body.put("points", points);
                } catch (JSONException e) {
                    return Outcome.RETRY;
                }

                Api.Response res;
                try {
                    res = Api.post(server, "/api/device/locations", token, body);
                } catch (IOException e) {
                    TrackerStore.uploadFailed(app, "Can't reach the server. Will try again when there is internet.");
                    TrackerCore.notifyChanged();
                    return Outcome.RETRY;
                }

                if (res.ok()) {
                    JSONArray rejected = res.json == null ? null : res.json.optJSONArray("rejected");
                    if (rejected != null) {
                        for (int i = 0; i < rejected.length(); i++) {
                            JSONObject r = rejected.optJSONObject(i);
                            if (r != null) {
                                Log.w(
                                    TrackerCore.TAG,
                                    "Server rejected point " + r.optString("clientId") + " for good: " + r.optString("reason")
                                );
                            }
                        }
                    }
                    // Every point in the batch is now settled on the server.
                    q.delete(sent);
                    TrackerStore.uploadSucceeded(app);
                    handleAnswer(app, res.json);
                    TrackerCore.notifyChanged();
                    continue;
                }
                if (res.isRevocation()) {
                    TrackerCore.revoke(app);
                    return Outcome.REVOKED;
                }
                if (res.code == 429) {
                    TrackerStore.uploadFailed(app, "The server asked to slow down. Will try again shortly.");
                } else {
                    String msg = res.errorMessage();
                    TrackerStore.uploadFailed(app, msg != null ? msg : "The server answered " + res.code + ". Will try again.");
                }
                TrackerCore.notifyChanged();
                return Outcome.RETRY;
            }
            // More than this run may send without hitting the rate limit: continue after a pause.
            return q.count() > 0 ? Outcome.RETRY : Outcome.DONE;
        }
    }

    /** config + locateRequests, shared by the upload and heartbeat answers. */
    static void handleAnswer(Context ctx, JSONObject answer) {
        if (answer == null) return;
        JSONObject config = answer.optJSONObject("config");
        if (config != null && TrackerStore.saveConfig(ctx, config)) {
            TrackingService.reconfigure();
            HeartbeatWorker.schedulePeriodic(ctx, true);
        }
        JSONArray locate = answer.optJSONArray("locateRequests");
        if (locate != null && locate.length() > 0) LocateWorker.enqueue(ctx, locate);
    }
}
