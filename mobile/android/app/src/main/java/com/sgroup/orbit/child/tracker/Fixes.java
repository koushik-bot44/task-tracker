package com.sgroup.orbit.child.tracker;

import android.annotation.SuppressLint;
import android.content.Context;
import android.location.Location;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * One fresh, high-accuracy fix, or an honest reason why there is none. Never
 * returns a cached or made-up position: maxUpdateAge is 0.
 * Must be called from a background thread (it blocks up to the timeout).
 */
final class Fixes {

    private Fixes() {}

    static final class NoFix extends Exception {

        /** PERMISSION_DENIED | LOCATION_DISABLED | TIMEOUT | UNAVAILABLE (the server's reasons). */
        final String reason;

        NoFix(String reason, String message) {
            super(message);
            this.reason = reason;
        }
    }

    /**
     * @param needBackground true when called with no screen open (Locate Now):
     *     then "Allow all the time" (or the running location service) is required.
     */
    @SuppressLint("MissingPermission") // checked below
    static Location fresh(Context ctx, int timeoutSeconds, boolean needBackground) throws NoFix {
        Context app = ctx.getApplicationContext();
        if (!TrackerCore.hasForegroundLocation(app)) {
            throw new NoFix("PERMISSION_DENIED", "Location permission is off.");
        }
        if (needBackground && !TrackerCore.hasBackgroundLocation(app) && !"RUNNING".equals(TrackingService.currentState())) {
            throw new NoFix("PERMISSION_DENIED", "\"Allow all the time\" is off.");
        }
        if (!TrackerCore.locationEnabled(app)) {
            throw new NoFix("LOCATION_DISABLED", "Location is switched off on this phone.");
        }
        FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(app);
        CurrentLocationRequest req = new CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setDurationMillis(timeoutSeconds * 1000L)
            .setMaxUpdateAgeMillis(0)
            .build();
        CancellationTokenSource cancel = new CancellationTokenSource();
        try {
            Task<Location> task = client.getCurrentLocation(req, cancel.getToken());
            Location l = Tasks.await(task, timeoutSeconds + 5L, TimeUnit.SECONDS);
            if (l == null || l.getTime() <= 0) {
                throw new NoFix("TIMEOUT", "No position arrived in " + timeoutSeconds + " seconds. Try near a window or outside.");
            }
            return l;
        } catch (TimeoutException e) {
            cancel.cancel();
            throw new NoFix("TIMEOUT", "No position arrived in " + timeoutSeconds + " seconds. Try near a window or outside.");
        } catch (ExecutionException e) {
            if (e.getCause() instanceof SecurityException) throw new NoFix("PERMISSION_DENIED", "Location permission is off.");
            throw new NoFix("UNAVAILABLE", "The phone couldn't get a position right now.");
        } catch (InterruptedException e) {
            cancel.cancel();
            Thread.currentThread().interrupt();
            throw new NoFix("UNAVAILABLE", "The phone couldn't get a position right now.");
        } catch (SecurityException e) {
            throw new NoFix("PERMISSION_DENIED", "Location permission is off.");
        }
    }
}
