package com.sgroup.orbit.child.tracker;

import android.util.Log;
import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Collections;
import java.util.Map;

/**
 * FCM data messages {type: "LOCATE_NOW", requestId}. Optional: without
 * app/google-services.json Firebase never starts, this service never runs, and
 * Locate Now is answered at the next heartbeat or upload instead.
 */
public class LocateNowMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (!"LOCATE_NOW".equals(data.get("type"))) return;
        String id = data.get("requestId");
        if (id == null || id.isEmpty() || !TrackerStore.isPaired(this)) return;
        Log.i(TrackerCore.TAG, "Locate Now push received");
        // A high-priority message briefly lets the app start its foreground
        // service from the background, so sharing is also restarted if it died.
        TrackerCore.ensureTracking(this, null);
        LocateWorker.enqueueIds(this, Collections.singletonList(id));
    }

    @Override
    public void onNewToken(@NonNull String token) {
        if (TrackerStore.setPushToken(this, token) && TrackerStore.isPaired(this)) {
            HeartbeatWorker.sendSoon(this, "PERIODIC");
        }
    }
}
