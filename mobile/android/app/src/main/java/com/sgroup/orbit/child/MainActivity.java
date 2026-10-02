package com.sgroup.orbit.child;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;
import com.sgroup.orbit.child.tracker.ChildTrackerPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The native tracker must be registered before the bridge starts.
        registerPlugin(ChildTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onPause() {
        super.onPause();
        // The app shows the Orbit site (2026-10-02): save its sign-in cookie now, so
        // Android closing the app from Recents doesn't sign the person out.
        CookieManager.getInstance().flush();
    }
}
