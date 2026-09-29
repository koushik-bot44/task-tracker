// Orbit Child (iOS) — the Capacitor plugin mobile/www/app.js talks to.
//
// JS name "ChildTracker". Every method resolves to a TrackerState object:
// { platform: "ios", paired, revoked, serverUrl?, deviceId?, personName?,
//   permission: "ALWAYS"|"WHILE_IN_USE"|"DENIED"|"NOT_DETERMINED",
//   preciseLocation: bool|null, locationEnabled, notificationsAllowed: bool|null,
//   batteryOptimized: null, trackingState: "RUNNING"|"STOPPED"|"STARTING",
//   lastFixAt?, lastUploadAt?, lastUploadError?, queueSize }
// and "stateChange" events carry the same object. The device token never
// crosses into JavaScript.
//
// Registered by OrbitBridgeViewController.capacitorDidLoad() (a local plugin;
// it is not an npm package, so `cap sync` does not know about it).

import Foundation
import Capacitor

@objc(ChildTrackerPlugin)
public class ChildTrackerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ChildTrackerPlugin"
    public let jsName = "ChildTracker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pair", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestForegroundPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBackgroundPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBatteryExemption", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openLocationSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendNow", returnType: CAPPluginReturnPromise),
    ]

    private var stateObserver: NSObjectProtocol?

    override public func load() {
        stateObserver = NotificationCenter.default.addObserver(forName: .orbitTrackerStateChanged, object: nil, queue: .main) { [weak self] note in
            guard let state = note.userInfo?["state"] as? [String: Any] else { return }
            self?.notifyListeners("stateChange", data: state)
        }
    }

    deinit {
        if let observer = stateObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    private var tracker: TrackerManager {
        return TrackerManager.shared
    }

    private func resolveState(_ call: CAPPluginCall) {
        tracker.currentState { state in
            call.resolve(state)
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        resolveState(call)
    }

    /// { serverUrl, code } → POST /api/device/pair. Rejects with plain words.
    @objc func pair(_ call: CAPPluginCall) {
        let serverUrl = call.getString("serverUrl") ?? ""
        let code = call.getString("code") ?? ""
        onMain {
            self.tracker.pair(serverUrl: serverUrl, code: code) { result in
                switch result {
                case .success:
                    self.resolveState(call)
                case .failure(let error):
                    call.reject(error.message, error.code)
                }
            }
        }
    }

    /// requestWhenInUseAuthorization; opens Settings when iOS will not ask again.
    @objc func requestForegroundPermission(_ call: CAPPluginCall) {
        onMain {
            self.tracker.requestForegroundPermission {
                self.resolveState(call)
            }
        }
    }

    /// requestAlwaysAuthorization; opens Settings when already denied or when iOS
    /// has used up its one "Change to Always Allow?" question.
    @objc func requestBackgroundPermission(_ call: CAPPluginCall) {
        onMain {
            self.tracker.requestBackgroundPermission {
                self.resolveState(call)
            }
        }
    }

    /// UNUserNotificationCenter + registerForRemoteNotifications.
    @objc func requestNotificationPermission(_ call: CAPPluginCall) {
        onMain {
            self.tracker.requestNotificationPermission {
                self.resolveState(call)
            }
        }
    }

    /// iOS has no battery-optimisation exemption: nothing to ask; returns the state.
    @objc func requestBatteryExemption(_ call: CAPPluginCall) {
        resolveState(call)
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        onMain {
            self.tracker.openSettings()
            self.resolveState(call)
        }
    }

    /// iOS has no public link to Settings → Privacy → Location Services, so this
    /// opens the app's own Settings page (which has the Location row).
    @objc func openLocationSettings(_ call: CAPPluginCall) {
        onMain {
            self.tracker.openSettings()
            self.resolveState(call)
        }
    }

    /// Starts tracking when paired and "Always" is granted; otherwise STOPPED.
    @objc func startTracking(_ call: CAPPluginCall) {
        onMain {
            self.tracker.startTracking()
            self.resolveState(call)
        }
    }

    /// One fresh fix (trigger APP_OPEN), upload, heartbeat APP_OPEN.
    @objc func sendNow(_ call: CAPPluginCall) {
        onMain {
            self.tracker.sendNow { result in
                switch result {
                case .success:
                    self.resolveState(call)
                case .failure(let error):
                    call.reject(error.message, error.code)
                }
            }
        }
    }
}
