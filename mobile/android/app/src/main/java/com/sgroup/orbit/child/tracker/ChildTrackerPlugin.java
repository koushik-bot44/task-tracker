package com.sgroup.orbit.child.tracker;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.lifecycle.Lifecycle;
import androidx.work.WorkManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.sgroup.orbit.child.BuildConfig;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * "ChildTracker" — the only thing mobile/www/app.js talks to. Every method
 * resolves to a TrackerState (see TrackerCore.state) unless it rejects with a
 * plain-English message. The device token never leaves native code.
 */
@CapacitorPlugin(
    name = "ChildTracker",
    permissions = {
        @Permission(
            alias = ChildTrackerPlugin.LOCATION,
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }
        ),
        @Permission(alias = ChildTrackerPlugin.BACKGROUND, strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
        @Permission(alias = ChildTrackerPlugin.NOTIFICATIONS, strings = { Manifest.permission.POST_NOTIFICATIONS }),
    }
)
public class ChildTrackerPlugin extends Plugin implements TrackerCore.Listener {

    static final String LOCATION = "location";
    static final String BACKGROUND = "background";
    static final String NOTIFICATIONS = "notifications";

    /** Long work (network, fixes): never on the bridge thread. */
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    /** State events, so they are not stuck behind a 30-second fix. */
    private final ExecutorService events = Executors.newSingleThreadExecutor();
    private final Object emitLock = new Object();

    @Nullable
    private String lastEmitted;

    // ---- lifecycle ---------------------------------------------------------------

    @Override
    public void load() {
        TrackerCore.setListener(this);
        final Context ctx = getContext().getApplicationContext();
        run(io, () -> {
            TrackerCore.ensureChannel(ctx);
            if (!TrackerStore.isPaired(ctx)) return;
            HeartbeatWorker.schedulePeriodic(ctx, false);
            TrackerCore.refreshPushToken(ctx);
            if (LocationQueue.get(ctx).count() > 0) UploadWorker.schedule(ctx, false);
        });
    }

    /** Back from Settings (or opened): read everything again, start sharing if now allowed, report changes. */
    @Override
    protected void handleOnResume() {
        final Context ctx = getContext().getApplicationContext();
        run(io, () -> {
            if (TrackerStore.isPaired(ctx)) {
                TrackerCore.ensureTracking(ctx, null);
                TrackerCore.reportIfPermissionsChanged(ctx);
            }
            emit();
        });
    }

    @Override
    protected void handleOnDestroy() {
        TrackerCore.clearListener(this);
        io.shutdown();
        events.shutdown();
    }

    @Override
    public void onTrackerStateChanged() {
        run(events, this::emit);
    }

    private void emit() {
        JSONObject s = TrackerCore.state(getContext());
        String text = s.toString();
        synchronized (emitLock) {
            if (text.equals(lastEmitted)) return;
            lastEmitted = text;
        }
        try {
            notifyListeners("stateChange", JSObject.fromJSONObject(s));
        } catch (JSONException e) {
            Log.w(TrackerCore.TAG, "Could not emit state", e);
        }
    }

    private void resolveState(PluginCall call) {
        try {
            call.resolve(JSObject.fromJSONObject(TrackerCore.state(getContext())));
        } catch (JSONException e) {
            call.reject("Could not read the phone's state.");
        }
    }

    private static void run(ExecutorService ex, Runnable r) {
        try {
            ex.execute(r);
        } catch (RejectedExecutionException ignored) {
            // The screen is closing.
        }
    }

    private boolean inForeground() {
        Activity a = getActivity();
        return a instanceof androidx.lifecycle.LifecycleOwner &&
            ((androidx.lifecycle.LifecycleOwner) a).getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.STARTED);
    }

    // ---- state -------------------------------------------------------------------

    @PluginMethod
    public void getState(PluginCall call) {
        Context ctx = getContext();
        // The app is on screen, so Android allows starting the service now.
        if (TrackerStore.isPaired(ctx) && inForeground()) TrackerCore.ensureTracking(ctx, null);
        resolveState(call);
    }

    // ---- pairing -----------------------------------------------------------------

    @PluginMethod
    public void pair(final PluginCall call) {
        run(io, () -> doPair(call));
    }

    private void doPair(PluginCall call) {
        Context ctx = getContext().getApplicationContext();
        String serverUrl = normalizeUrl(call.getString("serverUrl", ""));
        String code = call.getString("code", "");
        code = code == null ? "" : code.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        if (serverUrl.isEmpty()) {
            call.reject("Enter your family's Orbit address.", "MISSING_ADDRESS");
            return;
        }
        if (code.isEmpty()) {
            call.reject("Enter the code from your parent's screen.", "MISSING_CODE");
            return;
        }
        if (!Api.allowedScheme(serverUrl)) {
            call.reject(
                BuildConfig.DEBUG
                    ? "The address must start with https:// (or http:// for a test server)."
                    : "The address must start with https://.",
                "INSECURE_ADDRESS"
            );
            return;
        }
        try {
            URL u = new URL(serverUrl);
            if (u.getHost() == null || u.getHost().isEmpty()) throw new MalformedURLException();
        } catch (MalformedURLException e) {
            call.reject("That address doesn't look right. It should look like https://orbit.example.com", "BAD_ADDRESS");
            return;
        }

        JSONObject body = new JSONObject();
        try {
            body.put("code", code);
            body.put("platform", "ANDROID");
            body.put("appVersion", HeartbeatWorker.clip(TrackerCore.appVersion(), 40));
            body.put("model", HeartbeatWorker.clip(Build.MANUFACTURER + " " + Build.MODEL, 80));
            body.put("osVersion", HeartbeatWorker.clip(TrackerCore.osVersion(), 40));
            body.put("name", HeartbeatWorker.clip(Build.MODEL, 80));
        } catch (JSONException e) {
            call.reject("Could not prepare the request.");
            return;
        }

        Api.Response res;
        try {
            res = Api.post(serverUrl, "/api/device/pair", null, body);
        } catch (IOException e) {
            call.reject("Can't reach " + serverUrl + ". Check the address and the internet.", "NETWORK");
            return;
        }

        if (res.ok()) {
            String deviceId = TrackerCore.str(res.json, "deviceId");
            String token = TrackerCore.str(res.json, "deviceToken");
            if (deviceId == null || token == null) {
                call.reject("That address doesn't look like Orbit. Check it with your parent.", "NOT_ORBIT");
                return;
            }
            // A fresh pairing starts clean: no old queue, no old scheduled work.
            try {
                WorkManager.getInstance(ctx).cancelAllWorkByTag(TrackerCore.WORK_TAG);
            } catch (RuntimeException ignored) {}
            LocationQueue.get(ctx).clear();
            TrackerStore.saveCredentials(
                ctx,
                serverUrl,
                deviceId,
                token,
                TrackerCore.str(res.json, "personName"),
                res.json.optJSONObject("config")
            );
            HeartbeatWorker.schedulePeriodic(ctx, true);
            HeartbeatWorker.sendSoon(ctx, "PERIODIC");
            TrackerCore.refreshPushToken(ctx);
            TrackerCore.ensureTracking(ctx, null);
            emit();
            resolveState(call);
            return;
        }
        if (res.code == 404) {
            if ("PAIRING_INVALID".equals(res.errorCode())) {
                call.reject("That code didn't work. Ask your parent for a new one.", "PAIRING_INVALID");
            } else {
                call.reject("That address doesn't look like Orbit. Check it with your parent.", "NOT_ORBIT");
            }
            return;
        }
        if (res.code == 429) {
            call.reject("Too many tries. Wait a minute and try again.", "RATE_LIMITED");
            return;
        }
        if (res.code >= 300 && res.code < 400) {
            call.reject("That address sends the app somewhere else. Enter the exact Orbit address.", "REDIRECT");
            return;
        }
        String msg = res.errorMessage();
        String errCode = res.errorCode();
        call.reject(
            msg != null ? msg : "Connecting didn't work (the server answered " + res.code + "). Try again.",
            errCode != null ? errCode : "PAIR_FAILED"
        );
    }

    /** Trims, drops trailing slashes, and assumes https:// when no scheme was typed. */
    static String normalizeUrl(@Nullable String raw) {
        if (raw == null) return "";
        String s = raw.trim();
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        if (s.isEmpty()) return s;
        if (!s.contains("://")) s = "https://" + s;
        return s;
    }

    // ---- permissions -------------------------------------------------------------

    @PluginMethod
    public void requestForegroundPermission(PluginCall call) {
        Context ctx = getContext();
        if (TrackerCore.hasForegroundLocation(ctx)) {
            after(call);
            return;
        }
        if (
            TrackerStore.wasAsked(ctx, LOCATION) &&
            !rationale(Manifest.permission.ACCESS_FINE_LOCATION) &&
            !rationale(Manifest.permission.ACCESS_COARSE_LOCATION)
        ) {
            // Android no longer shows the dialog after two refusals: only Settings can change it.
            openSettings(call, appDetails());
            return;
        }
        TrackerStore.markAsked(ctx, LOCATION);
        requestPermissionForAlias(LOCATION, call, "onPermissionResult");
    }

    /**
     * "Allow all the time". Android 10 offers it in the permission dialog;
     * Android 11 and later only on the app's settings page (Google's rule),
     * where the screen tells the child: Permissions → Location → Allow all the time.
     */
    @PluginMethod
    public void requestBackgroundPermission(PluginCall call) {
        Context ctx = getContext();
        if (!TrackerCore.hasForegroundLocation(ctx)) {
            requestForegroundPermission(call);
            return;
        }
        if (TrackerCore.hasBackgroundLocation(ctx)) {
            after(call);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            openSettings(call, appDetails());
            return;
        }
        if (TrackerStore.wasAsked(ctx, BACKGROUND) && !rationale(Manifest.permission.ACCESS_BACKGROUND_LOCATION)) {
            openSettings(call, appDetails());
            return;
        }
        TrackerStore.markAsked(ctx, BACKGROUND);
        requestPermissionForAlias(BACKGROUND, call, "onPermissionResult");
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        Context ctx = getContext();
        if (TrackerCore.notificationsAllowed(ctx)) {
            after(call);
            return;
        }
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !TrackerCore.granted(ctx, Manifest.permission.POST_NOTIFICATIONS)
        ) {
            if (TrackerStore.wasAsked(ctx, NOTIFICATIONS) && !rationale(Manifest.permission.POST_NOTIFICATIONS)) {
                openSettings(call, notificationSettings(), appDetails());
                return;
            }
            TrackerStore.markAsked(ctx, NOTIFICATIONS);
            requestPermissionForAlias(NOTIFICATIONS, call, "onPermissionResult");
            return;
        }
        // Switched off in Settings (app or the "sharing" channel).
        openSettings(call, notificationSettings(), appDetails());
    }

    /** The system dialog "Let app always run in background?" for this package only. */
    @SuppressLint("BatteryLife")
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        Context ctx = getContext();
        if (!TrackerCore.batteryOptimized(ctx)) {
            after(call);
            return;
        }
        Intent ask = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName()));
        openSettings(call, ask, new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), appDetails());
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openSettings(call, appDetails());
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        openSettings(call, new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS), appDetails());
    }

    @PermissionCallback
    private void onPermissionResult(@Nullable PluginCall call) {
        after(call);
    }

    @ActivityCallback
    private void onSettingsResult(@Nullable PluginCall call, ActivityResult result) {
        after(call);
    }

    /** After any permission step: start sharing if now allowed, report changes, answer with the state. */
    private void after(@Nullable final PluginCall call) {
        final Context ctx = getContext().getApplicationContext();
        run(io, () -> {
            if (TrackerStore.isPaired(ctx)) {
                TrackerCore.ensureTracking(ctx, null);
                TrackerCore.reportIfPermissionsChanged(ctx);
            }
            emit();
            if (call != null) resolveState(call);
        });
    }

    private boolean rationale(String permission) {
        Activity a = getActivity();
        return a != null && ActivityCompat.shouldShowRequestPermissionRationale(a, permission);
    }

    /** Opens the first Settings screen this phone has; the call resolves when the child comes back. */
    private void openSettings(PluginCall call, Intent... intents) {
        for (Intent i : intents) {
            try {
                startActivityForResult(call, i, "onSettingsResult");
                return;
            } catch (ActivityNotFoundException e) {
                Log.w(TrackerCore.TAG, "No settings screen for " + i.getAction());
            }
        }
        after(call);
    }

    private Intent appDetails() {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
    }

    private Intent notificationSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        }
        return appDetails();
    }

    // ---- sharing -----------------------------------------------------------------

    /** Starts the location service when paired, "Allow all the time" is granted and location is on. */
    @PluginMethod
    public void startTracking(final PluginCall call) {
        final Context ctx = getContext().getApplicationContext();
        run(io, () -> {
            if (!TrackerStore.isPaired(ctx)) {
                call.reject("This phone isn't connected yet. Enter the code from your parent first.", "NOT_PAIRED");
                return;
            }
            HeartbeatWorker.schedulePeriodic(ctx, false);
            TrackerCore.ensureTracking(ctx, null);
            resolveState(call);
        });
    }

    /**
     * "Send my location now": one fresh high-accuracy fix queued with trigger
     * APP_OPEN, the queue flushed, and an APP_OPEN heartbeat. Rejects with the
     * plain reason when no position could be taken (the heartbeat still goes).
     */
    @PluginMethod
    public void sendNow(final PluginCall call) {
        final Context ctx = getContext().getApplicationContext();
        run(io, () -> {
            if (!TrackerStore.isPaired(ctx)) {
                call.reject("This phone isn't connected yet. Enter the code from your parent first.", "NOT_PAIRED");
                return;
            }
            TrackerCore.ensureTracking(ctx, null);
            String problem = null;
            try {
                Location l = Fixes.fresh(ctx, TrackerStore.config(ctx).locateTimeoutSeconds, false);
                TrackerCore.queueFix(ctx, l, "APP_OPEN", null);
            } catch (Fixes.NoFix e) {
                problem = e.getMessage();
            } catch (RuntimeException e) {
                Log.w(TrackerCore.TAG, "Fix failed", e);
                problem = "The phone couldn't get a position right now.";
            }
            UploadWorker.Outcome up = UploadWorker.flush(ctx);
            if (up == UploadWorker.Outcome.RETRY) UploadWorker.schedule(ctx, false);
            if (up != UploadWorker.Outcome.REVOKED && TrackerStore.isPaired(ctx)) {
                UploadWorker.Outcome hb = HeartbeatWorker.send(ctx, "APP_OPEN", Api.TIMEOUT_MS);
                if (hb == UploadWorker.Outcome.RETRY) HeartbeatWorker.sendSoon(ctx, "APP_OPEN");
            }
            emit();
            if (problem != null && TrackerStore.isPaired(ctx)) {
                call.reject("Couldn't get a position: " + problem, "NO_FIX");
            } else {
                resolveState(call);
            }
        });
    }
}
