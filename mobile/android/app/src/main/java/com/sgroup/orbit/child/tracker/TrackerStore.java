package com.sgroup.orbit.child.tracker;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.Nullable;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * commit() (not apply()) is used on purpose where the value must be on disk
 * before the next step: new or cleared credentials, the shutdown time (the
 * phone is powering off), and a claimed Locate Now id.
 *
 * Everything the tracker remembers, in the app's private SharedPreferences
 * (Context.MODE_PRIVATE: no other app can read it, and backups are switched off
 * in the manifest). The device token lives here and is never handed to
 * JavaScript: {@link #token(Context)} is package-private and only the native
 * HTTP code reads it.
 */
@SuppressLint("ApplySharedPref")
final class TrackerStore {

    private static final String PREFS = "orbit_child_tracker";

    private static final String K_SERVER_URL = "serverUrl";
    private static final String K_DEVICE_ID = "deviceId";
    private static final String K_DEVICE_TOKEN = "deviceToken";
    private static final String K_PERSON_NAME = "personName";
    private static final String K_CONFIG = "config";
    private static final String K_REVOKED = "revoked";
    private static final String K_LAST_FIX_AT = "lastFixAt";
    private static final String K_LAST_UPLOAD_AT = "lastUploadAt";
    private static final String K_LAST_UPLOAD_ERROR = "lastUploadError";
    private static final String K_PUSH_TOKEN = "pushToken";
    private static final String K_LAST_SHUTDOWN_AT = "lastShutdownAt";
    private static final String K_BOOTED_AT = "bootedAt";
    private static final String K_LAST_REPORTED_SIG = "lastReportedSig";
    private static final String K_LAST_START_ERROR = "lastStartError";
    private static final String K_LOCATE_HANDLED = "locateHandled";
    private static final String K_ASKED_PREFIX = "asked.";

    private TrackerStore() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---- pairing / credentials ---------------------------------------------

    static boolean isPaired(Context ctx) {
        SharedPreferences p = prefs(ctx);
        return p.getString(K_DEVICE_TOKEN, null) != null && p.getString(K_DEVICE_ID, null) != null && p.getString(K_SERVER_URL, null) != null;
    }

    static boolean isRevoked(Context ctx) {
        return prefs(ctx).getBoolean(K_REVOKED, false);
    }

    @Nullable
    static String serverUrl(Context ctx) {
        return prefs(ctx).getString(K_SERVER_URL, null);
    }

    @Nullable
    static String deviceId(Context ctx) {
        return prefs(ctx).getString(K_DEVICE_ID, null);
    }

    /** The bearer token. Package-private on purpose: native networking only. */
    @Nullable
    static String token(Context ctx) {
        return prefs(ctx).getString(K_DEVICE_TOKEN, null);
    }

    @Nullable
    static String personName(Context ctx) {
        return prefs(ctx).getString(K_PERSON_NAME, null);
    }

    static void saveCredentials(
        Context ctx,
        String serverUrl,
        String deviceId,
        String token,
        @Nullable String personName,
        @Nullable JSONObject config
    ) {
        SharedPreferences.Editor e = prefs(ctx)
            .edit()
            .putString(K_SERVER_URL, serverUrl)
            .putString(K_DEVICE_ID, deviceId)
            .putString(K_DEVICE_TOKEN, token)
            .putBoolean(K_REVOKED, false)
            .remove(K_LAST_UPLOAD_AT)
            .remove(K_LAST_UPLOAD_ERROR)
            .remove(K_LAST_FIX_AT)
            .remove(K_LAST_REPORTED_SIG)
            .remove(K_LAST_START_ERROR)
            .remove(K_LOCATE_HANDLED);
        if (personName != null) e.putString(K_PERSON_NAME, personName);
        else e.remove(K_PERSON_NAME);
        if (config != null) e.putString(K_CONFIG, config.toString());
        e.commit();
    }

    /** The server said this phone is no longer allowed: forget everything but the address. */
    static void clearCredentials(Context ctx) {
        prefs(ctx)
            .edit()
            .remove(K_DEVICE_ID)
            .remove(K_DEVICE_TOKEN)
            .remove(K_PERSON_NAME)
            .remove(K_CONFIG)
            .remove(K_LAST_REPORTED_SIG)
            .remove(K_LAST_START_ERROR)
            .remove(K_LOCATE_HANDLED)
            .remove(K_LAST_UPLOAD_ERROR)
            .putBoolean(K_REVOKED, true)
            .commit();
    }

    // ---- server config -------------------------------------------------------

    static Config config(Context ctx) {
        String raw = prefs(ctx).getString(K_CONFIG, null);
        if (raw == null) return new Config();
        try {
            return Config.from(new JSONObject(raw));
        } catch (JSONException e) {
            return new Config();
        }
    }

    /** Stores the server's config; returns true when it changed anything we use. */
    static boolean saveConfig(Context ctx, @Nullable JSONObject json) {
        if (json == null) return false;
        Config before = config(ctx);
        prefs(ctx).edit().putString(K_CONFIG, json.toString()).apply();
        return !before.equals(Config.from(json));
    }

    // ---- times and status -----------------------------------------------------

    static long lastFixAt(Context ctx) {
        return prefs(ctx).getLong(K_LAST_FIX_AT, 0);
    }

    static void setLastFixAt(Context ctx, long ms) {
        if (ms > lastFixAt(ctx)) prefs(ctx).edit().putLong(K_LAST_FIX_AT, ms).apply();
    }

    static long lastUploadAt(Context ctx) {
        return prefs(ctx).getLong(K_LAST_UPLOAD_AT, 0);
    }

    @Nullable
    static String lastUploadError(Context ctx) {
        return prefs(ctx).getString(K_LAST_UPLOAD_ERROR, null);
    }

    static void uploadSucceeded(Context ctx) {
        prefs(ctx).edit().putLong(K_LAST_UPLOAD_AT, System.currentTimeMillis()).remove(K_LAST_UPLOAD_ERROR).apply();
    }

    static void uploadFailed(Context ctx, String message) {
        prefs(ctx).edit().putString(K_LAST_UPLOAD_ERROR, message).apply();
    }

    @Nullable
    static String pushToken(Context ctx) {
        return prefs(ctx).getString(K_PUSH_TOKEN, null);
    }

    /** Returns true if the token is new. */
    static boolean setPushToken(Context ctx, @Nullable String token) {
        String old = pushToken(ctx);
        if (token == null ? old == null : token.equals(old)) return false;
        prefs(ctx).edit().putString(K_PUSH_TOKEN, token).apply();
        return true;
    }

    static long lastShutdownAt(Context ctx) {
        return prefs(ctx).getLong(K_LAST_SHUTDOWN_AT, 0);
    }

    static void setLastShutdownAt(Context ctx, long ms) {
        // commit(): the phone is going down, this must be on disk now.
        prefs(ctx).edit().putLong(K_LAST_SHUTDOWN_AT, ms).commit();
    }

    static long bootedAt(Context ctx) {
        return prefs(ctx).getLong(K_BOOTED_AT, 0);
    }

    static void setBootedAt(Context ctx, long ms) {
        prefs(ctx).edit().putLong(K_BOOTED_AT, ms).apply();
    }

    @Nullable
    static String lastReportedSignature(Context ctx) {
        return prefs(ctx).getString(K_LAST_REPORTED_SIG, null);
    }

    static void setLastReportedSignature(Context ctx, String sig) {
        prefs(ctx).edit().putString(K_LAST_REPORTED_SIG, sig).apply();
    }

    @Nullable
    static String lastStartError(Context ctx) {
        return prefs(ctx).getString(K_LAST_START_ERROR, null);
    }

    static void setLastStartError(Context ctx, @Nullable String message) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        if (message == null) e.remove(K_LAST_START_ERROR);
        else e.putString(K_LAST_START_ERROR, message);
        e.apply();
    }

    /** Remembers that a runtime permission prompt was shown (to tell "never asked" from "denied"). */
    static void markAsked(Context ctx, String what) {
        prefs(ctx).edit().putBoolean(K_ASKED_PREFIX + what, true).apply();
    }

    static boolean wasAsked(Context ctx, String what) {
        return prefs(ctx).getBoolean(K_ASKED_PREFIX + what, false);
    }

    /**
     * Locate Now requests already taken on (from FCM, an upload answer or a
     * heartbeat answer), so the same request is not answered twice. Entries are
     * forgotten after an hour. Returns false if the id was already taken.
     */
    static synchronized boolean claimLocateRequest(Context ctx, String id) {
        long now = System.currentTimeMillis();
        JSONObject map;
        try {
            map = new JSONObject(prefs(ctx).getString(K_LOCATE_HANDLED, "{}"));
        } catch (JSONException e) {
            map = new JSONObject();
        }
        JSONObject kept = new JSONObject();
        Iterator<String> keys = map.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            long at = map.optLong(k, 0);
            if (now - at < 60 * 60 * 1000L) {
                try {
                    kept.put(k, at);
                } catch (JSONException ignored) {}
            }
        }
        if (kept.has(id)) return false;
        try {
            kept.put(id, now);
        } catch (JSONException ignored) {}
        prefs(ctx).edit().putString(K_LOCATE_HANDLED, kept.toString()).commit();
        return true;
    }

    // ---- ISO-8601 --------------------------------------------------------------

    static String iso(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    /** Parses the server's ISO times (e.g. "2026-09-29T10:15:00.000Z"); -1 if unreadable. */
    static long parseIso(@Nullable String s) {
        if (s == null) return -1;
        String[] patterns = { "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'" };
        for (String pattern : patterns) {
            SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            f.setLenient(false);
            try {
                Date d = f.parse(s);
                if (d != null) return d.getTime();
            } catch (ParseException ignored) {}
        }
        return -1;
    }

    // ---- DeviceConfig ------------------------------------------------------------

    /** The server's DeviceConfig with the plan's defaults, clamped to sane ranges. */
    static final class Config {

        int heartbeatSeconds = 900;
        int movingIntervalSeconds = 120;
        int stationaryIntervalSeconds = 900;
        int distanceFilterMeters = 50;
        int locateTimeoutSeconds = 30;
        int maxBatch = 200;

        static Config from(JSONObject j) {
            Config c = new Config();
            c.heartbeatSeconds = clamp(j.optInt("heartbeatSeconds", c.heartbeatSeconds), 900, 24 * 3600);
            c.movingIntervalSeconds = clamp(j.optInt("movingIntervalSeconds", c.movingIntervalSeconds), 15, 3600);
            c.stationaryIntervalSeconds = clamp(j.optInt("stationaryIntervalSeconds", c.stationaryIntervalSeconds), 60, 6 * 3600);
            c.distanceFilterMeters = clamp(j.optInt("distanceFilterMeters", c.distanceFilterMeters), 0, 5000);
            c.locateTimeoutSeconds = clamp(j.optInt("locateTimeoutSeconds", c.locateTimeoutSeconds), 5, 120);
            c.maxBatch = clamp(j.optInt("maxBatch", c.maxBatch), 1, 200);
            return c;
        }

        private static int clamp(int v, int lo, int hi) {
            return Math.max(lo, Math.min(hi, v));
        }

        @Override
        public boolean equals(Object o) {
            if (!(o instanceof Config)) return false;
            Config c = (Config) o;
            return (
                c.heartbeatSeconds == heartbeatSeconds &&
                c.movingIntervalSeconds == movingIntervalSeconds &&
                c.stationaryIntervalSeconds == stationaryIntervalSeconds &&
                c.distanceFilterMeters == distanceFilterMeters &&
                c.locateTimeoutSeconds == locateTimeoutSeconds &&
                c.maxBatch == maxBatch
            );
        }

        @Override
        public int hashCode() {
            int h = heartbeatSeconds;
            h = 31 * h + movingIntervalSeconds;
            h = 31 * h + stationaryIntervalSeconds;
            h = 31 * h + distanceFilterMeters;
            h = 31 * h + locateTimeoutSeconds;
            h = 31 * h + maxBatch;
            return h;
        }
    }
}
