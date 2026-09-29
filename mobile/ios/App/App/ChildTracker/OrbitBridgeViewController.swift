// Orbit Child (iOS) — the Capacitor bridge view controller with the local
// ChildTracker plugin registered (Capacitor's documented way for plugins that
// live inside the app rather than in an npm package).
//
// Used by SceneDelegate (which builds the root view controller in code in the
// Capacitor 8 template) and by Main.storyboard.

import UIKit
import Capacitor

class OrbitBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ChildTrackerPlugin())
    }
}
