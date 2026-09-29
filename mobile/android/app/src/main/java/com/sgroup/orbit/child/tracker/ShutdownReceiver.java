package com.sgroup.orbit.child.tracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * ACTION_SHUTDOWN: record the time on disk, then try a SHUTDOWN heartbeat for
 * at most 3 seconds. Best effort only: the phone may power off first, and the
 * next BOOT heartbeat reports lastShutdownAt anyway.
 *
 * Declared in the manifest and also registered by the running TrackingService
 * (manifest receivers do not get this broadcast on every Android version).
 */
public class ShutdownReceiver extends BroadcastReceiver {

    private static final long BUDGET_MS = 3_000;
    private static volatile long handledAt;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_SHUTDOWN.equals(intent.getAction())) return;
        final Context ctx = context.getApplicationContext();
        if (!TrackerStore.isPaired(ctx)) return;
        long now = System.currentTimeMillis();
        // Both receivers may fire for the same shutdown.
        if (now - handledAt < 30_000) return;
        handledAt = now;
        TrackerStore.setLastShutdownAt(ctx, now);
        Log.i(TrackerCore.TAG, "Phone shutting down");

        final PendingResult pending = goAsync();
        final ExecutorService ex = Executors.newSingleThreadExecutor();
        new Thread(() -> {
            try {
                Future<?> f = ex.submit(() -> HeartbeatWorker.send(ctx, "SHUTDOWN", (int) BUDGET_MS));
                f.get(BUDGET_MS, TimeUnit.MILLISECONDS);
            } catch (Exception e) {
                Log.i(TrackerCore.TAG, "Shutdown heartbeat not sent in time");
            } finally {
                ex.shutdownNow();
                pending.finish();
            }
        }, "orbit-shutdown").start();
    }
}
