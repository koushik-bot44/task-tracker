package com.sgroup.orbit.child.tracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.util.Log;

/**
 * After a restart (BOOT_COMPLETED) or an app update (MY_PACKAGE_REPLACED):
 * if the phone is paired, record when it booted, restart sharing when
 * "Allow all the time" is granted and location is on, and tell the server.
 *
 * A phone that was Force Stopped gets neither broadcast until the app is
 * opened again: that is Android's rule and the app does not work around it.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        boolean boot = Intent.ACTION_BOOT_COMPLETED.equals(action);
        boolean updated = Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
        if (!boot && !updated) return;
        Context ctx = context.getApplicationContext();
        if (!TrackerStore.isPaired(ctx)) return;
        Log.i(TrackerCore.TAG, boot ? "Phone booted" : "App updated");

        // The real boot time, from the phone's own clock.
        TrackerStore.setBootedAt(ctx, System.currentTimeMillis() - SystemClock.elapsedRealtime());

        // Both broadcasts allow starting a foreground service from the background.
        TrackerCore.ensureTracking(ctx, boot ? "BOOT" : null);
        HeartbeatWorker.schedulePeriodic(ctx, false);
        // An update is not a reboot: it is reported as an ordinary heartbeat (with the new appVersion).
        HeartbeatWorker.sendSoon(ctx, boot ? "BOOT" : "PERIODIC");
        if (LocationQueue.get(ctx).count() > 0) UploadWorker.schedule(ctx, false);
    }
}
