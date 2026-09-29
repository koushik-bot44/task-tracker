package com.sgroup.orbit.child.tracker;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.DatabaseUtils;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.location.Location;
import android.util.Log;
import androidx.annotation.Nullable;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Every fix is written here first, then uploaded, and deleted only after the
 * server has answered for it (accepted, duplicate, or rejected for good). It
 * survives the app being killed and the phone restarting.
 *
 * Only real fixes are stored: the position and the time come from the
 * {@link Location} the OS delivered (recordedAt = Location.getTime()); nothing
 * is ever invented or adjusted.
 */
final class LocationQueue extends SQLiteOpenHelper {

    private static final String TAG = "OrbitChild";
    private static final String DB = "orbit_child_queue.db";
    private static final int VERSION = 1;
    private static final String T = "points";

    /** The server rejects fixes older than 30 days; keep nothing it would refuse. */
    private static final long MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000;
    /** Hard cap so a phone offline for weeks cannot fill its storage. */
    private static final int MAX_ROWS = 50_000;

    private static volatile LocationQueue instance;

    static LocationQueue get(Context ctx) {
        LocationQueue q = instance;
        if (q == null) {
            synchronized (LocationQueue.class) {
                q = instance;
                if (q == null) {
                    q = new LocationQueue(ctx.getApplicationContext());
                    instance = q;
                }
            }
        }
        return q;
    }

    private LocationQueue(Context ctx) {
        super(ctx, DB, null, VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE " +
            T +
            " (" +
            "id INTEGER PRIMARY KEY AUTOINCREMENT," +
            "clientId TEXT NOT NULL UNIQUE," +
            "lat REAL NOT NULL," +
            "lng REAL NOT NULL," +
            "accuracy REAL," +
            "altitude REAL," +
            "speed REAL," +
            "heading REAL," +
            "recordedAt TEXT NOT NULL," +
            "recordedAtMs INTEGER NOT NULL," +
            "trigger TEXT," +
            "locateRequestId TEXT," +
            "batteryLevel INTEGER," +
            "isCharging INTEGER," +
            "networkType TEXT," +
            "queuedAt INTEGER NOT NULL" +
            ")"
        );
        db.execSQL("CREATE INDEX points_recorded ON " + T + " (recordedAtMs)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Version 1 is the only schema so far.
    }

    /** Stores one real fix; returns its clientId (a UUID, unique per device). */
    String insert(
        Location loc,
        String trigger,
        @Nullable String locateRequestId,
        @Nullable Integer batteryLevel,
        @Nullable Boolean isCharging,
        @Nullable String networkType
    ) {
        String clientId = UUID.randomUUID().toString();
        ContentValues v = new ContentValues();
        v.put("clientId", clientId);
        v.put("lat", loc.getLatitude());
        v.put("lng", loc.getLongitude());
        if (loc.hasAccuracy()) v.put("accuracy", (double) loc.getAccuracy());
        if (loc.hasAltitude()) v.put("altitude", loc.getAltitude());
        if (loc.hasSpeed()) v.put("speed", (double) loc.getSpeed());
        if (loc.hasBearing()) v.put("heading", (double) loc.getBearing());
        v.put("recordedAt", TrackerStore.iso(loc.getTime()));
        v.put("recordedAtMs", loc.getTime());
        v.put("trigger", trigger);
        if (locateRequestId != null) v.put("locateRequestId", locateRequestId);
        if (batteryLevel != null) v.put("batteryLevel", batteryLevel);
        if (isCharging != null) v.put("isCharging", isCharging ? 1 : 0);
        if (networkType != null) v.put("networkType", networkType);
        v.put("queuedAt", System.currentTimeMillis());
        getWritableDatabase().insertOrThrow(T, null, v);
        return clientId;
    }

    /** A queued point, ready to send as DevicePointIn. */
    static final class Row {

        final String clientId;
        final JSONObject json;

        Row(String clientId, JSONObject json) {
            this.clientId = clientId;
            this.json = json;
        }
    }

    List<Row> oldest(int limit) {
        List<Row> rows = new ArrayList<>();
        try (
            Cursor c = getReadableDatabase()
                .query(T, null, null, null, null, null, "recordedAtMs ASC, id ASC", String.valueOf(Math.max(1, limit)))
        ) {
            while (c.moveToNext()) {
                String clientId = c.getString(c.getColumnIndexOrThrow("clientId"));
                JSONObject p = new JSONObject();
                try {
                    p.put("clientId", clientId);
                    p.put("lat", c.getDouble(c.getColumnIndexOrThrow("lat")));
                    p.put("lng", c.getDouble(c.getColumnIndexOrThrow("lng")));
                    putDouble(c, p, "accuracy");
                    putDouble(c, p, "altitude");
                    putDouble(c, p, "speed");
                    putDouble(c, p, "heading");
                    p.put("recordedAt", c.getString(c.getColumnIndexOrThrow("recordedAt")));
                    putString(c, p, "trigger");
                    putString(c, p, "locateRequestId");
                    int bi = c.getColumnIndexOrThrow("batteryLevel");
                    if (!c.isNull(bi)) p.put("batteryLevel", c.getInt(bi));
                    int ci = c.getColumnIndexOrThrow("isCharging");
                    if (!c.isNull(ci)) p.put("isCharging", c.getInt(ci) != 0);
                    putString(c, p, "networkType");
                } catch (JSONException e) {
                    Log.w(TAG, "Skipping unreadable queued point " + clientId, e);
                    continue;
                }
                rows.add(new Row(clientId, p));
            }
        }
        return rows;
    }

    private static void putDouble(Cursor c, JSONObject p, String col) throws JSONException {
        int i = c.getColumnIndexOrThrow(col);
        if (!c.isNull(i)) p.put(col, c.getDouble(i));
    }

    private static void putString(Cursor c, JSONObject p, String col) throws JSONException {
        int i = c.getColumnIndexOrThrow(col);
        if (!c.isNull(i)) p.put(col, c.getString(i));
    }

    int delete(Collection<String> clientIds) {
        if (clientIds.isEmpty()) return 0;
        SQLiteDatabase db = getWritableDatabase();
        int n = 0;
        db.beginTransaction();
        try {
            for (String id : clientIds) {
                n += db.delete(T, "clientId = ?", new String[] { id });
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return n;
    }

    int count() {
        try {
            return (int) DatabaseUtils.queryNumEntries(getReadableDatabase(), T);
        } catch (RuntimeException e) {
            Log.w(TAG, "Queue count failed", e);
            return 0;
        }
    }

    void clear() {
        getWritableDatabase().delete(T, null, null);
    }

    /**
     * Drops what the server would refuse anyway (older than 30 days) and, past a
     * hard cap, the oldest rows. Both are logged; neither alters a point.
     */
    void prune() {
        SQLiteDatabase db = getWritableDatabase();
        long cutoff = System.currentTimeMillis() - MAX_AGE_MS;
        int old = db.delete(T, "recordedAtMs < ?", new String[] { String.valueOf(cutoff) });
        if (old > 0) Log.w(TAG, "Dropped " + old + " queued points older than 30 days (the server would reject them)");
        int total = count();
        if (total > MAX_ROWS) {
            int extra = total - MAX_ROWS;
            db.execSQL("DELETE FROM " + T + " WHERE id IN (SELECT id FROM " + T + " ORDER BY recordedAtMs ASC, id ASC LIMIT " + extra + ")");
            Log.w(TAG, "Queue over " + MAX_ROWS + " points; dropped the " + extra + " oldest");
        }
    }
}
