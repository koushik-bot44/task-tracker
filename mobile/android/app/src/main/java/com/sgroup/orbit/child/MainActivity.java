package com.sgroup.orbit.child;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.sgroup.orbit.child.tracker.ChildTrackerPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The native tracker must be registered before the bridge starts.
        registerPlugin(ChildTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
