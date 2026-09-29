// Orbit Child (iOS) — the tracker: permissions, location, the queue, uploads,
// heartbeats and Locate Now. One instance for the whole process; it lives
// independently of the web view, so it also works when iOS relaunches the app
// in the background (significant change, visit, region exit, silent push,
// background refresh) and no screen is ever shown.
//
// Honesty rules (plan sections 3, 7, 11):
// - No stealth: showsBackgroundLocationIndicator is always true, the status
//   screen always says what is happening, and there is no "stop" in the app.
// - No fabricated positions or times: every point is a CLLocation or CLVisit
//   from iOS, stamped with iOS's own time. When there is no fix, nothing is sent
//   but the heartbeat, which says so.
// - No attempts to defeat iOS limits: only Apple's documented background
//   location modes, silent pushes and BGAppRefreshTask are used.
//
// Threading: every method and property here is used on the MAIN thread. File
// work (LocationQueue) and network (DeviceApi) run elsewhere and call back on main.

import Foundation
import CoreLocation
import UIKit
import UserNotifications
import BackgroundTasks

extension Notification.Name {
    /// Posted on main with userInfo["state"] = TrackerState dictionary.
    static let orbitTrackerStateChanged = Notification.Name("OrbitChildTrackerStateChanged")
}

struct TrackerError: Error {
    let message: String
    let code: String
}

/// Why a single fresh fix could not be had (the D4 `reason` values).
enum FixFailure: String, Error {
    case permissionDenied = "PERMISSION_DENIED"
    case locationDisabled = "LOCATION_DISABLED"
    case timeout = "TIMEOUT"
    case unavailable = "UNAVAILABLE"

    var plainWords: String {
        switch self {
        case .permissionDenied:
            return "Location permission is off for Orbit Child."
        case .locationDisabled:
            return "Location is switched off on this phone."
        case .timeout:
            return "The phone couldn't get a position in time. Try again near a window or outside."
        case .unavailable:
            return "The phone couldn't get a position right now."
        }
    }
}

/// One wait for a single fresh fix (Send now / Locate Now).
private final class OneShot {
    let trigger: String
    let locateRequestId: String?
    let startedAt = Date()
    let completion: (Result<QueuedPoint, FixFailure>) -> Void
    var done = false

    init(trigger: String, locateRequestId: String?, completion: @escaping (Result<QueuedPoint, FixFailure>) -> Void) {
        self.trigger = trigger
        self.locateRequestId = locateRequestId
        self.completion = completion
    }
}

/// A JS promise waiting for the child to answer an iOS permission question.
private final class PermissionWaiter {
    let callback: () -> Void
    var fired = false

    init(callback: @escaping () -> Void) {
        self.callback = callback
    }
}

private struct PointsBody: Encodable {
    let points: [QueuedPoint]
}

final class TrackerManager: NSObject, CLLocationManagerDelegate {
    static let shared = TrackerManager()
    static let heartbeatTaskId = "com.sgroup.orbit.child.heartbeat"

    private static let movingSpeed: CLLocationSpeed = 1.5          // m/s: faster than this is "moving"
    private static let stillAfter: TimeInterval = 600               // back to "still" after 10 min without a moving fix
    private static let freshFixWindow: TimeInterval = 120           // a one-shot accepts a fix at most this much older than the ask
    private static let minUploadGap: TimeInterval = 30              // unforced uploads at most this often
    private static let backgroundFixBudget: TimeInterval = 20       // fix wait for a background Locate Now (iOS gives ~30 s in all)
    private static let pushAnswerDeadline: TimeInterval = 27        // always answer iOS's silent-push handler before ~30 s
    private static let resumeRegionId = "com.sgroup.orbit.child.resume"

    private let store = TrackerStore()
    private let queue = LocationQueue()
    private let api = DeviceApi()
    private let network = NetworkMonitor.shared

    private var manager: CLLocationManager?
    private var authStatus: CLAuthorizationStatus = .notDetermined
    private var fullAccuracy = true
    private var locationEnabled = true
    private var notificationsAllowed: Bool?
    private var bootstrapped = false
    private var dataReady = false               // UserDefaults / Keychain / files readable (after first unlock)
    private var servicesActive = false          // standard + significant + visits started
    private var paused = false                  // iOS paused standard updates (pausesLocationUpdatesAutomatically)
    private var lastMovingAt: Date?
    private var lastLocation: CLLocation?
    private var lastFixAt: Date?
    private var lastQueuedAt: Date?
    private var heldPoints: [QueuedPoint] = []  // fixes that could not be written yet (phone locked since restart)
    private var oneShots: [OneShot] = []
    private var permissionWaiters: [PermissionWaiter] = []
    private var launchHeartbeatPending = false
    private var rebootDetected = false
    private var firstFixAfterBoot = false
    private var uploading = false
    private var flushAgain = false
    private var flushAgainForced = false
    private var flushWaiters: [() -> Void] = []
    private var flushWork: BackgroundWork?
    private var batchLimit = 200
    private var backoffUntil = Date.distantPast
    private var rateLimitedUntil = Date.distantPast
    private var lastUploadAttemptAt = Date.distantPast
    private var failureStreak = 0
    private var retryTimer: Timer?
    private var heartbeatInFlight = false
    private var locatesInFlight = Set<String>()
    private var emitScheduled = false

    private override init() {
        super.init()
    }

    // MARK: - Launch (AppDelegate)

    /// Must run before application(_:didFinishLaunchingWithOptions:) returns.
    func registerBackgroundTasks() {
        _ = BGTaskScheduler.shared.register(forTaskWithIdentifier: TrackerManager.heartbeatTaskId, using: nil) { task in
            DispatchQueue.main.async {
                TrackerManager.shared.runBackgroundRefresh(task)
            }
        }
    }

    /// Every launch, including background relaunches by iOS for a location event
    /// (launchOptions[.location]) or a silent push. Re-creates the location
    /// manager and resumes tracking when it is allowed.
    func bootstrap(launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
        guard !bootstrapped else { return }
        bootstrapped = true
        let launchedForLocation = launchOptions?[.location] != nil
        let quietLaunch = launchedForLocation || launchOptions?[.remoteNotification] != nil
        launchHeartbeatPending = true

        network.onBecameReachable = { self.networkCameBack() }
        network.start()
        _ = DeviceInfo.battery()

        let m = CLLocationManager()
        m.delegate = self
        manager = m
        authStatus = m.authorizationStatus
        fullAccuracy = m.accuracyAuthorization == .fullAccuracy

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(appDidBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(appDidEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(protectedDataAvailable), name: UIApplication.protectedDataDidBecomeAvailableNotification, object: nil)

        if launchedForLocation && authStatus == .authorizedAlways && !UIApplication.shared.isProtectedDataAvailable {
            // Relaunched for a location event while the phone is still locked since a
            // restart: keep collecting (held in memory) until the data can be read.
            startLocationServices()
        }

        refreshNotificationSettings(nil)
        refreshLocationServices {
            if UIApplication.shared.isProtectedDataAvailable {
                self.dataBecameReady()
            }
        }
        // The launch heartbeat's event depends on whether the child opened the app.
        DispatchQueue.main.asyncAfter(deadline: .now() + (quietLaunch ? 0.5 : 2.0)) {
            self.sendLaunchHeartbeatIfPending()
        }
    }

    private func dataBecameReady() {
        guard !dataReady else { return }
        dataReady = true

        if !store.installed {
            // iOS keeps Keychain items when an app is deleted; drop a token left by an earlier install.
            store.clearToken()
            store.installed = true
        }
        if store.deviceId != nil, case .missing = store.deviceToken() {
            // Restored from a backup onto another phone: the token never travels (ThisDeviceOnly).
            store.clearPairing(keepServer: true)
        }
        if let boot = DeviceInfo.bootTime() {
            if let last = store.lastBootTime, abs(boot.timeIntervalSince(last)) > 60 {
                rebootDetected = true
                firstFixAfterBoot = true
            }
            store.lastBootTime = boot
        }
        if let seen = lastFixAt, store.lastFixAt.map({ seen > $0 }) ?? true {
            store.lastFixAt = seen
        }
        lastFixAt = store.lastFixAt
        if let queued = lastQueuedAt, store.lastQueuedAt.map({ queued > $0 }) ?? true {
            store.lastQueuedAt = queued
        }
        lastQueuedAt = store.lastQueuedAt

        queue.load { self.emitState() }
        if isPaired {
            persistHeldPoints(nil)
            startIfAllowed()
            UIApplication.shared.registerForRemoteNotifications()
            scheduleBackgroundRefresh()
        } else {
            heldPoints.removeAll()
            stopLocationServices()
        }
        sendLaunchHeartbeatIfPending()
        emitState()
    }

    private func sendLaunchHeartbeatIfPending() {
        guard launchHeartbeatPending, dataReady else { return }
        launchHeartbeatPending = false
        let event: String
        if rebootDetected {
            event = "BOOT"
        } else if UIApplication.shared.applicationState == .active {
            event = "APP_OPEN"
        } else {
            event = "PERIODIC"
        }
        sendHeartbeat(event: event, force: true)
    }

    @objc private func appDidBecomeActive() {
        refreshLocationServices {
            self.refreshNotificationSettings {
                self.checkStatusChanged()
                self.emitState()
            }
        }
        // Coming back from an iOS permission question or from Settings.
        firePermissionWaiters(after: 0.6)
        guard dataReady else { return }
        if launchHeartbeatPending {
            sendLaunchHeartbeatIfPending()
        } else {
            heartbeatIfDue()
        }
        if isPaired {
            startIfAllowed()
            if queue.count > 0 || !heldPoints.isEmpty {
                flush(force: false)
            }
        }
    }

    @objc private func appDidEnterBackground() {
        scheduleBackgroundRefresh()
    }

    @objc private func protectedDataAvailable() {
        refreshLocationServices {
            self.dataBecameReady()
        }
    }

    private func networkCameBack() {
        guard isPaired else { return }
        backoffUntil = .distantPast
        if queue.count > 0 || !heldPoints.isEmpty {
            flush(force: false)
        }
        heartbeatIfDue()
    }

    // MARK: - Pairing and state

    private var isPaired: Bool {
        guard dataReady, !store.revoked, store.deviceId != nil, store.serverUrl != nil else { return false }
        if case .missing = store.deviceToken() { return false }
        return true
    }

    private func credentials() -> (base: String, token: String)? {
        guard isPaired, let base = store.serverUrl, case .value(let token) = store.deviceToken() else { return nil }
        return (base, token)
    }

    /// https://host[:port][/path] without a trailing slash; plain http only in DEBUG builds.
    static func normalizeServer(_ raw: String) -> Result<String, TrackerError> {
        var text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while text.hasSuffix("/") {
            text.removeLast()
        }
        if !text.isEmpty && !text.contains("://") {
            text = "https://" + text
        }
        guard let parts = URLComponents(string: text), let scheme = parts.scheme?.lowercased(),
              let host = parts.host, !host.isEmpty else {
            return .failure(TrackerError(message: "That address doesn't look right. It should look like https://orbit.example.com", code: "BAD_ADDRESS"))
        }
        #if DEBUG
        let allowed = scheme == "https" || scheme == "http"
        #else
        let allowed = scheme == "https"
        #endif
        guard allowed else {
            return .failure(TrackerError(message: "The address must start with https://", code: "NOT_HTTPS"))
        }
        return .success(text)
    }

    /// D1. The token goes to the Keychain and never to JavaScript.
    func pair(serverUrl rawServer: String, code rawCode: String, completion: @escaping (Result<Void, TrackerError>) -> Void) {
        guard dataReady else {
            completion(.failure(TrackerError(message: "Unlock the phone and try again.", code: "LOCKED")))
            return
        }
        let base: String
        switch TrackerManager.normalizeServer(rawServer) {
        case .success(let value):
            base = value
        case .failure(let error):
            completion(.failure(error))
            return
        }
        let code = String(rawCode.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) })
        guard !code.isEmpty else {
            completion(.failure(TrackerError(message: "Enter the code from your parent's screen.", code: "NO_CODE")))
            return
        }
        let body: [String: Any] = [
            "code": code,
            "platform": "IOS",
            "appVersion": DeviceInfo.appVersion,
            "model": DeviceInfo.model,
            "osVersion": DeviceInfo.osVersion,
            "name": DeviceInfo.deviceName,
        ]
        api.post(base, "/api/device/pair", token: nil, json: body) { result in
            switch result {
            case .transport:
                completion(.failure(TrackerError(message: "Can't reach \(base). Check the address and the internet.", code: "NETWORK")))
            case .response(let r):
                if r.ok, let json = r.json, let deviceId = json["deviceId"] as? String, !deviceId.isEmpty,
                   let token = json["deviceToken"] as? String, !token.isEmpty {
                    self.finishPairing(base: base, deviceId: deviceId, token: token, json: json, completion: completion)
                } else if r.status == 404 || r.code == "PAIRING_INVALID" {
                    completion(.failure(TrackerError(message: "That code didn't work. Ask your parent for a new one.", code: "PAIRING_INVALID")))
                } else if r.status == 429 || r.code == "RATE_LIMITED" {
                    completion(.failure(TrackerError(message: "Too many tries. Wait a minute and try again.", code: "RATE_LIMITED")))
                } else if r.ok {
                    completion(.failure(TrackerError(message: "The server's answer didn't make sense. Check the address.", code: "BAD_ANSWER")))
                } else {
                    let words = r.message ?? "Something went wrong (error \(r.status)). Try again."
                    completion(.failure(TrackerError(message: words, code: r.code ?? "HTTP_\(r.status)")))
                }
            }
        }
    }

    private func finishPairing(base: String, deviceId: String, token: String, json: [String: Any],
                               completion: @escaping (Result<Void, TrackerError>) -> Void) {
        // Fixes queued under an earlier pairing are not sent under this one.
        failAllOneShots(.unavailable)
        stopLocationServices()
        store.clearPairing(keepServer: false)
        heldPoints.removeAll()
        guard store.saveToken(token) else {
            completion(.failure(TrackerError(message: "This phone couldn't store its key safely. Try again.", code: "KEYCHAIN")))
            return
        }
        queue.clear {
            self.store.serverUrl = base
            self.store.deviceId = deviceId
            self.store.personName = json["personName"] as? String
            self.store.revoked = false
            self.store.config = DeviceConfig.standard.merged(with: json["config"] as? [String: Any])
            self.lastQueuedAt = nil
            self.backoffUntil = .distantPast
            self.rateLimitedUntil = .distantPast
            self.failureStreak = 0
            UIApplication.shared.registerForRemoteNotifications()
            self.startIfAllowed()
            self.scheduleBackgroundRefresh()
            self.launchHeartbeatPending = false
            self.sendHeartbeat(event: "APP_OPEN", force: true)
            self.emitState()
            completion(.success(()))
        }
    }

    /// The server said this phone was removed (401 DEVICE_REVOKED / DEVICE_UNAUTHORIZED).
    private func revokeLocally() {
        failAllOneShots(.unavailable)
        stopLocationServices()
        store.clearPairing(keepServer: true)
        store.revoked = true
        heldPoints.removeAll()
        queue.clear()
        retryTimer?.invalidate()
        retryTimer = nil
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: TrackerManager.heartbeatTaskId)
        emitState()
    }

    /// TrackerState for JavaScript, with location-services and notification state read fresh.
    func currentState(completion: @escaping ([String: Any]) -> Void) {
        onMain {
            self.refreshLocationServices {
                self.refreshNotificationSettings {
                    completion(self.stateDict())
                }
            }
        }
    }

    private func stateDict() -> [String: Any] {
        var state: [String: Any] = [
            "platform": "ios",
            "paired": isPaired,
            "revoked": dataReady ? store.revoked : false,
            "permission": permissionString,
            "preciseLocation": orNull(preciseValue),
            "locationEnabled": locationEnabled,
            "notificationsAllowed": orNull(notificationsAllowed),
            "batteryOptimized": NSNull(),
            "trackingState": trackingStateString,
            "queueSize": queue.count + heldPoints.count,
        ]
        if dataReady {
            if let value = store.serverUrl { state["serverUrl"] = value }
            if isPaired {
                if let value = store.deviceId { state["deviceId"] = value }
                if let value = store.personName { state["personName"] = value }
            }
            if let value = store.lastUploadAt { state["lastUploadAt"] = Iso.string(value) }
            if let value = store.lastUploadError { state["lastUploadError"] = value }
        }
        if let value = lastFixAt { state["lastFixAt"] = Iso.string(value) }
        return state
    }

    private func orNull(_ value: Bool?) -> Any {
        if let value = value { return value }
        return NSNull()
    }

    private var permissionString: String {
        switch authStatus {
        case .authorizedAlways:
            return "ALWAYS"
        case .authorizedWhenInUse:
            return "WHILE_IN_USE"
        case .denied, .restricted:
            return "DENIED"
        case .notDetermined:
            return "NOT_DETERMINED"
        @unknown default:
            return "NOT_DETERMINED"
        }
    }

    private var preciseValue: Bool? {
        guard authStatus == .authorizedAlways || authStatus == .authorizedWhenInUse else { return nil }
        return fullAccuracy
    }

    private var trackingStateString: String {
        if servicesActive && authStatus == .authorizedAlways && locationEnabled && isPaired {
            return "RUNNING"
        }
        if servicesActive && !dataReady && authStatus == .authorizedAlways {
            return "STARTING"
        }
        return "STOPPED"
    }

    /// Coalesces bursts into one "stateChange" event.
    private func emitState() {
        guard !emitScheduled else { return }
        emitScheduled = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            self.emitScheduled = false
            NotificationCenter.default.post(name: .orbitTrackerStateChanged, object: nil, userInfo: ["state": self.stateDict()])
        }
    }

    private func refreshLocationServices(_ then: (() -> Void)?) {
        // Apple asks for this check off the main thread.
        DispatchQueue.global(qos: .utility).async {
            let enabled = CLLocationManager.locationServicesEnabled()
            DispatchQueue.main.async {
                self.locationEnabled = enabled
                then?()
            }
        }
    }

    private func refreshNotificationSettings(_ then: (() -> Void)?) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let allowed: Bool
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                allowed = true
            default:
                allowed = false
            }
            DispatchQueue.main.async {
                self.notificationsAllowed = allowed
                then?()
            }
        }
    }

    // MARK: - Permissions (each JS promise resolves after the child answers)

    func requestForegroundPermission(completion: @escaping () -> Void) {
        guard let m = manager else { completion(); return }
        switch authStatus {
        case .notDetermined:
            addPermissionWaiter(completion)
            m.requestWhenInUseAuthorization()
        case .denied, .restricted:
            // iOS will not ask again; the only way back is Settings.
            openSettings()
            completion()
        default:
            completion()
        }
    }

    func requestBackgroundPermission(completion: @escaping () -> Void) {
        guard let m = manager else { completion(); return }
        switch authStatus {
        case .authorizedAlways:
            completion()
        case .denied, .restricted:
            openSettings()
            completion()
        default:
            addPermissionWaiter(completion)
            var questionShown = false
            let observer = NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { _ in
                questionShown = true
            }
            m.requestAlwaysAuthorization()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                NotificationCenter.default.removeObserver(observer)
                if !questionShown && self.authStatus != .authorizedAlways {
                    // iOS asks "Change to Always Allow?" only once per app; after that
                    // the choice is only in Settings → Orbit Child → Location → Always.
                    self.openSettings()
                    self.firePermissionWaiters(after: 0)
                }
            }
        }
    }

    func requestNotificationPermission(completion: @escaping () -> Void) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            let status = settings.authorizationStatus
            DispatchQueue.main.async {
                switch status {
                case .notDetermined:
                    center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
                        DispatchQueue.main.async {
                            UIApplication.shared.registerForRemoteNotifications()
                            self.refreshNotificationSettings {
                                self.checkStatusChanged()
                                completion()
                            }
                        }
                    }
                case .denied:
                    self.openSettings()
                    completion()
                default:
                    UIApplication.shared.registerForRemoteNotifications()
                    self.refreshNotificationSettings {
                        completion()
                    }
                }
            }
        }
    }

    /// Opens this app's page in Settings (iOS has no public link to the Location Services page).
    func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    private func addPermissionWaiter(_ callback: @escaping () -> Void) {
        let waiter = PermissionWaiter(callback: callback)
        permissionWaiters.append(waiter)
        DispatchQueue.main.asyncAfter(deadline: .now() + 120) {
            self.fire(waiter)
        }
    }

    private func fire(_ waiter: PermissionWaiter) {
        guard !waiter.fired else { return }
        waiter.fired = true
        permissionWaiters.removeAll { $0 === waiter }
        waiter.callback()
    }

    private func firePermissionWaiters(after delay: TimeInterval) {
        guard !permissionWaiters.isEmpty else { return }
        let waiters = permissionWaiters
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            waiters.forEach { self.fire($0) }
        }
    }

    // MARK: - Tracking

    func startTracking() {
        startIfAllowed()
        emitState()
    }

    private func startIfAllowed() {
        guard isPaired, authStatus == .authorizedAlways else { return }
        startLocationServices()
    }

    private func startLocationServices() {
        guard let m = manager, authStatus == .authorizedAlways else { return }
        m.allowsBackgroundLocationUpdates = true
        m.showsBackgroundLocationIndicator = true          // the blue indicator is always shown: no stealth
        m.pausesLocationUpdatesAutomatically = true
        m.activityType = .other
        m.distanceFilter = store.config.distanceFilterMeters
        if oneShots.isEmpty {
            m.desiredAccuracy = isMoving ? kCLLocationAccuracyNearestTenMeters : kCLLocationAccuracyHundredMeters
        }
        m.startUpdatingLocation()
        if CLLocationManager.significantLocationChangeMonitoringAvailable() {
            // Lets iOS relaunch the app after it was terminated or the phone restarted.
            m.startMonitoringSignificantLocationChanges()
        }
        m.startMonitoringVisits()
        if !servicesActive {
            servicesActive = true
            paused = false
            emitState()
        }
    }

    private func stopLocationServices() {
        guard let m = manager else { return }
        m.stopUpdatingLocation()
        m.stopMonitoringSignificantLocationChanges()
        m.stopMonitoringVisits()
        stopResumeRegion()
        let wasActive = servicesActive
        servicesActive = false
        paused = false
        if wasActive {
            emitState()
        }
    }

    private var isMoving: Bool {
        guard let at = lastMovingAt else { return false }
        return Date().timeIntervalSince(at) < TrackerManager.stillAfter
    }

    /// 100 m accuracy while still, 10 m while moving; the configured distance filter.
    private func adjustAccuracy() {
        guard servicesActive, oneShots.isEmpty, let m = manager else { return }
        let wanted = isMoving ? kCLLocationAccuracyNearestTenMeters : kCLLocationAccuracyHundredMeters
        if m.desiredAccuracy != wanted {
            m.desiredAccuracy = wanted
        }
        let filter = store.config.distanceFilterMeters
        if m.distanceFilter != filter {
            m.distanceFilter = filter
        }
    }

    private func resumeIfPaused() {
        guard paused, servicesActive, authStatus == .authorizedAlways, let m = manager else { return }
        paused = false
        stopResumeRegion()
        m.startUpdatingLocation()
    }

    private func stopResumeRegion() {
        guard let m = manager else { return }
        for region in m.monitoredRegions where region.identifier == TrackerManager.resumeRegionId {
            m.stopMonitoring(for: region)
        }
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authStatus = manager.authorizationStatus
        fullAccuracy = manager.accuracyAuthorization == .fullAccuracy
        refreshLocationServices {
            self.applyAuthorization()
            if self.authStatus != .notDetermined {
                self.firePermissionWaiters(after: 0)
            }
        }
    }

    private func applyAuthorization() {
        if isPaired {
            if authStatus == .authorizedAlways {
                startLocationServices()
            } else if locationEnabled {
                // "Always" was taken away: tracking stops and the family is told.
                // (When Location Services are off for the whole phone, iOS reports
                // "denied" too; then the registrations stay so tracking resumes.)
                failAllOneShots(.permissionDenied)
                stopLocationServices()
            }
        }
        checkStatusChanged()
        emitState()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let valid = locations.filter { $0.horizontalAccuracy >= 0 }.sorted { $0.timestamp < $1.timestamp }
        guard let newest = valid.last else { return }
        noteFix(newest)
        resumeIfPaused()

        // A waiting Send now / Locate Now takes the first fresh fix.
        var answered = false
        for shot in oneShots where !shot.done {
            if newest.timestamp >= shot.startedAt.addingTimeInterval(-TrackerManager.freshFixWindow) {
                complete(shot, .success(makePoint(newest, trigger: shot.trigger, locateRequestId: shot.locateRequestId)))
                answered = true
            }
        }
        if !oneShots.isEmpty && !servicesActive {
            // iOS answered with an older cached position: ask again while time lasts.
            manager.requestLocation()
        }
        if answered { return }

        // Background tracking: only with "Always", only while paired.
        guard servicesActive, authStatus == .authorizedAlways else { return }
        if dataReady && !isPaired { return }
        let spacing = TimeInterval(store.config.movingIntervalSeconds)
        if let last = lastQueuedAt, newest.timestamp >= last, newest.timestamp.timeIntervalSince(last) < spacing {
            return
        }
        let trigger: String
        if firstFixAfterBoot {
            trigger = "BOOT"
            firstFixAfterBoot = false
        } else {
            trigger = isMoving ? "MOTION" : "BACKGROUND"
        }
        enqueue(makePoint(newest, trigger: trigger, locateRequestId: nil)) { _ in
            self.flush(force: false)
            self.heartbeatIfDue()
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied {
            // The authorization callback reports the change to the family.
            failAllOneShots(.permissionDenied)
            return
        }
        // kCLErrorLocationUnknown is temporary: a waiting one-shot asks again while its time lasts.
        if !oneShots.isEmpty && !servicesActive {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                if !self.oneShots.isEmpty && !self.servicesActive {
                    self.manager?.requestLocation()
                }
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
        resumeIfPaused()
        guard servicesActive, authStatus == .authorizedAlways, visit.horizontalAccuracy >= 0 else { return }
        if dataReady && !isPaired { return }
        // iOS's own arrival/departure time for the place. Battery and network are
        // left out: they are known only for now, not for that time.
        let when: Date
        if visit.departureDate != Date.distantFuture {
            when = visit.departureDate
        } else if visit.arrivalDate != Date.distantPast {
            when = visit.arrivalDate
        } else {
            return
        }
        if lastFixAt.map({ when > $0 }) ?? true {
            lastFixAt = when
            if dataReady { store.lastFixAt = when }
        }
        let point = QueuedPoint(
            clientId: UUID().uuidString.lowercased(),
            lat: visit.coordinate.latitude,
            lng: visit.coordinate.longitude,
            accuracy: finite(visit.horizontalAccuracy),
            altitude: nil,
            speed: nil,
            heading: nil,
            recordedAt: Iso.string(when),
            trigger: "BACKGROUND",
            locateRequestId: nil,
            batteryLevel: nil,
            isCharging: nil,
            networkType: nil
        )
        enqueue(point) { _ in
            self.flush(force: false)
            self.heartbeatIfDue()
        }
    }

    func locationManagerDidPauseLocationUpdates(_ manager: CLLocationManager) {
        paused = true
        // Standing still: iOS paused updates. A 150 m exit region (plus significant
        // changes and visits) wakes the app again when the phone moves.
        if let last = lastLocation, CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) {
            var radius = max(150, last.horizontalAccuracy)
            let limit = manager.maximumRegionMonitoringDistance
            if limit > 0 {
                radius = min(radius, limit)
            }
            let region = CLCircularRegion(center: last.coordinate, radius: radius, identifier: TrackerManager.resumeRegionId)
            region.notifyOnEntry = false
            region.notifyOnExit = true
            manager.startMonitoring(for: region)
        }
        emitState()
    }

    func locationManagerDidResumeLocationUpdates(_ manager: CLLocationManager) {
        paused = false
        stopResumeRegion()
        emitState()
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard region.identifier == TrackerManager.resumeRegionId else { return }
        manager.stopMonitoring(for: region)
        resumeIfPaused()
    }

    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        // Nothing to do: significant changes and visits still wake the app.
    }

    // MARK: - Fixes and the queue

    private func noteFix(_ location: CLLocation) {
        lastLocation = location
        if location.speed > TrackerManager.movingSpeed {
            lastMovingAt = location.timestamp
        }
        if lastFixAt.map({ location.timestamp > $0 }) ?? true {
            lastFixAt = location.timestamp
            if dataReady { store.lastFixAt = location.timestamp }
        }
        adjustAccuracy()
    }

    private func finite(_ value: Double) -> Double? {
        return value.isFinite ? value : nil
    }

    /// A DevicePointIn from a real CLLocation, stamped with its own timestamp.
    private func makePoint(_ location: CLLocation, trigger: String, locateRequestId: String?) -> QueuedPoint {
        let battery = DeviceInfo.battery()
        return QueuedPoint(
            clientId: UUID().uuidString.lowercased(),
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            accuracy: finite(location.horizontalAccuracy),
            altitude: location.verticalAccuracy >= 0 ? finite(location.altitude) : nil,
            speed: location.speed >= 0 ? finite(location.speed) : nil,
            heading: location.course >= 0 ? finite(location.course) : nil,
            recordedAt: Iso.string(location.timestamp),
            trigger: trigger,
            locateRequestId: locateRequestId,
            batteryLevel: battery.level,
            isCharging: battery.charging,
            networkType: network.networkType
        )
    }

    /// Every fix goes to disk first; upload happens after.
    private func enqueue(_ point: QueuedPoint, completion: ((Bool) -> Void)? = nil) {
        if let at = Iso.date(point.recordedAt), lastQueuedAt.map({ at > $0 }) ?? true {
            lastQueuedAt = at
            if dataReady { store.lastQueuedAt = at }
        }
        guard dataReady else {
            heldPoints.append(point)
            completion?(false)
            return
        }
        queue.append(point) { ok in
            if !ok {
                self.heldPoints.append(point)
            }
            self.emitState()
            completion?(ok)
        }
    }

    private func persistHeldPoints(_ then: (() -> Void)?) {
        guard dataReady, !heldPoints.isEmpty else {
            then?()
            return
        }
        let points = heldPoints
        heldPoints.removeAll()
        let group = DispatchGroup()
        for point in points {
            group.enter()
            queue.append(point) { ok in
                if !ok {
                    self.heldPoints.append(point)
                }
                group.leave()
            }
        }
        group.notify(queue: .main) {
            self.emitState()
            then?()
        }
    }

    // MARK: - One fresh fix (Send now, Locate Now)

    private func requestFix(trigger: String, locateRequestId: String?, timeout: TimeInterval,
                            completion: @escaping (Result<QueuedPoint, FixFailure>) -> Void) {
        guard let m = manager else {
            completion(.failure(.unavailable))
            return
        }
        guard locationEnabled else {
            completion(.failure(.locationDisabled))
            return
        }
        let active = UIApplication.shared.applicationState == .active
        guard authStatus == .authorizedAlways || (authStatus == .authorizedWhenInUse && active) else {
            completion(.failure(.permissionDenied))
            return
        }
        let shot = OneShot(trigger: trigger, locateRequestId: locateRequestId, completion: completion)
        oneShots.append(shot)
        m.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        if servicesActive {
            m.distanceFilter = kCLDistanceFilterNone
            resumeIfPaused()
            m.startUpdatingLocation()
        } else {
            m.requestLocation()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak shot] in
            guard let shot = shot, !shot.done else { return }
            self.complete(shot, .failure(.timeout))
        }
    }

    private func complete(_ shot: OneShot, _ result: Result<QueuedPoint, FixFailure>) {
        guard !shot.done else { return }
        shot.done = true
        oneShots.removeAll { $0 === shot }
        if oneShots.isEmpty {
            if servicesActive {
                adjustAccuracy()
            } else {
                manager?.stopUpdatingLocation()    // cancels an outstanding requestLocation
            }
        }
        switch result {
        case .success(let point):
            enqueue(point) { _ in
                shot.completion(.success(point))
            }
        case .failure(let failure):
            shot.completion(.failure(failure))
        }
    }

    private func failAllOneShots(_ reason: FixFailure) {
        for shot in oneShots {
            complete(shot, .failure(reason))
        }
    }

    /// "Send my location now" on the status screen.
    func sendNow(completion: @escaping (Result<Void, TrackerError>) -> Void) {
        guard isPaired else {
            completion(.failure(TrackerError(message: "This phone isn't connected yet.", code: "NOT_PAIRED")))
            return
        }
        let work = BackgroundWork.begin("orbit-send-now")
        refreshLocationServices {
            let timeout = TimeInterval(self.store.config.locateTimeoutSeconds)
            self.requestFix(trigger: "APP_OPEN", locateRequestId: nil, timeout: timeout) { result in
                self.flush(force: true) {
                    self.sendHeartbeat(event: "APP_OPEN", force: true) {
                        work.end()
                        switch result {
                        case .success:
                            completion(.success(()))
                        case .failure(let failure):
                            completion(.failure(TrackerError(message: failure.plainWords, code: failure.rawValue)))
                        }
                    }
                }
            }
        }
    }

    // MARK: - Locate Now

    /// APNs silent push { aps: { content-available: 1 }, type: "LOCATE_NOW", requestId }.
    /// Returns false when the push is not ours.
    func handleRemoteNotification(_ userInfo: [AnyHashable: Any], completion: @escaping (UIBackgroundFetchResult) -> Void) -> Bool {
        guard (userInfo["type"] as? String) == "LOCATE_NOW", let requestId = userInfo["requestId"] as? String else {
            return false
        }
        onMain {
            guard self.dataReady else {
                // Locked since a restart: the request is answered at the next heartbeat.
                completion(.noData)
                return
            }
            self.fulfilLocate(requestId: requestId, completion: completion)
        }
        return true
    }

    private static func isSafeId(_ id: String) -> Bool {
        return !id.isEmpty && id.count <= 128 && id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
    }

    /// DELIVERED → one fresh fix → queue (LOCATE_NOW + requestId) → upload.
    /// On no permission / location off / no fix in time: FAILED with the reason.
    private func fulfilLocate(requestId: String, completion: ((UIBackgroundFetchResult) -> Void)?) {
        guard TrackerManager.isSafeId(requestId), let creds = credentials() else {
            completion?(.noData)
            return
        }
        if locatesInFlight.contains(requestId) || store.wasHandled(requestId) {
            completion?(.noData)
            return
        }
        locatesInFlight.insert(requestId)
        let work = BackgroundWork.begin("orbit-locate")
        let statusPath = "/api/device/locate/\(requestId)/status"
        var answered = false
        let answer: (UIBackgroundFetchResult) -> Void = { outcome in
            if !answered {
                answered = true
                completion?(outcome)
            }
        }
        if completion != nil {
            // iOS gives a silent push about 30 s; answer in time even on a slow network.
            DispatchQueue.main.asyncAfter(deadline: .now() + TrackerManager.pushAnswerDeadline) {
                answer(.failed)
            }
        }
        api.post(creds.base, statusPath, token: creds.token, json: ["status": "DELIVERED"]) { _ in }

        let active = UIApplication.shared.applicationState == .active
        let configured = TimeInterval(store.config.locateTimeoutSeconds)
        let timeout = active ? configured : min(configured, TrackerManager.backgroundFixBudget)
        refreshLocationServices {
            self.requestFix(trigger: "LOCATE_NOW", locateRequestId: requestId, timeout: timeout) { result in
                switch result {
                case .success:
                    self.flush(force: true) {
                        self.locateDone(requestId, work)
                        answer(self.store.lastUploadError == nil ? .newData : .failed)
                    }
                case .failure(let failure):
                    var body: [String: Any] = ["status": "FAILED", "reason": failure.rawValue]
                    if failure == .permissionDenied && self.authStatus == .authorizedWhenInUse {
                        body["detail"] = "Location is allowed only while the app is open, not Always."
                    }
                    self.api.post(creds.base, statusPath, token: creds.token, json: body) { _ in
                        self.sendHeartbeat(event: "LOCATE_NOW", force: true) {
                            self.locateDone(requestId, work)
                            answer(.failed)
                        }
                    }
                }
            }
        }
    }

    private func locateDone(_ requestId: String, _ work: BackgroundWork) {
        locatesInFlight.remove(requestId)
        if dataReady {
            store.markHandled(requestId)
        }
        work.end()
    }

    /// PendingLocate[] from a heartbeat or upload answer: the same fulfilment as a push.
    private func handleLocateRequests(_ raw: Any?, serverTime: String?) {
        guard let list = raw as? [[String: Any]], !list.isEmpty else { return }
        let now = serverTime.flatMap { Iso.date($0) } ?? Date()
        for item in list {
            guard let id = item["id"] as? String else { continue }
            if let expires = (item["expiresAt"] as? String).flatMap({ Iso.date($0) }), expires < now {
                continue
            }
            fulfilLocate(requestId: id, completion: nil)
        }
    }

    // MARK: - Upload (D2)

    /// Sends the queue in batches of maxBatch. `force` skips the gap/backoff
    /// (not a 429 wait). Completion runs when this round is over, sent or not.
    func flush(force: Bool, completion: (() -> Void)? = nil) {
        if let completion = completion {
            flushWaiters.append(completion)
        }
        guard let creds = credentials() else {
            finishFlush()
            return
        }
        if uploading {
            flushAgain = true
            flushAgainForced = flushAgainForced || force
            return
        }
        let now = Date()
        let blocked = now < rateLimitedUntil
            || (!force && (now < backoffUntil || now.timeIntervalSince(lastUploadAttemptAt) < TrackerManager.minUploadGap))
        if blocked {
            scheduleRetry()
            finishFlush()
            return
        }
        uploading = true
        if flushWork == nil {
            flushWork = BackgroundWork.begin("orbit-upload")
        }
        persistHeldPoints {
            self.uploadNextBatch(creds.base, creds.token)
        }
    }

    private func uploadNextBatch(_ base: String, _ token: String) {
        let size = min(store.config.maxBatch, batchLimit)
        queue.peek(max: size) { points in
            if points.isEmpty {
                self.finishFlush()
                return
            }
            let app = UIApplication.shared
            if app.applicationState != .active && app.backgroundTimeRemaining < 5 {
                // Out of background time: the rest goes at the next wake.
                self.finishFlush()
                return
            }
            guard let body = try? JSONEncoder().encode(PointsBody(points: points)) else {
                self.finishFlush()
                return
            }
            self.lastUploadAttemptAt = Date()
            self.api.post(base, "/api/device/locations", token: token, body: body) { result in
                switch result {
                case .transport:
                    self.noteFailure("Can't reach \(self.hostName(base)). Will try again.")
                    self.finishFlush()
                case .response(let r):
                    if r.ok {
                        // Accepted, duplicate and rejected rows are all answered for: delete them.
                        self.batchLimit = 200
                        let ids = Set(points.map { $0.clientId })
                        self.queue.remove(ids) {
                            self.noteSuccess()
                            self.store.lastUploadAt = Date()
                            self.applyConfig(r.json?["config"])
                            self.handleLocateRequests(r.json?["locateRequests"], serverTime: nil)
                            self.emitState()
                            if self.queue.count > 0 {
                                self.uploadNextBatch(base, token)
                            } else {
                                self.finishFlush()
                                self.heartbeatIfDue()
                            }
                        }
                    } else if self.isRevokedAnswer(r) {
                        self.revokeLocally()
                        self.finishFlush()
                    } else if r.status == 429 {
                        self.rateLimited(r)
                        self.finishFlush()
                    } else if (r.status == 400 || r.status == 413) && points.count > 1 {
                        // The body as a whole was refused (size or shape): try smaller batches.
                        self.batchLimit = max(1, points.count / 2)
                        self.uploadNextBatch(base, token)
                    } else {
                        // Rows stay queued; nothing is deleted without an answer for it.
                        let words = r.message.map { "Server problem: \($0). Will try again." } ?? "The server answered \(r.status). Will try again."
                        self.noteFailure(words)
                        self.finishFlush()
                    }
                }
            }
        }
    }

    private func finishFlush() {
        if uploading {
            uploading = false
            if flushAgain {
                let forced = flushAgainForced
                flushAgain = false
                flushAgainForced = false
                flush(force: forced)
                return
            }
        }
        flushWork?.end()
        flushWork = nil
        let waiters = flushWaiters
        flushWaiters = []
        waiters.forEach { $0() }
        emitState()
    }

    private func scheduleRetry() {
        guard retryTimer == nil, isPaired, queue.count > 0 || !heldPoints.isEmpty else { return }
        let due = max(rateLimitedUntil, backoffUntil, lastUploadAttemptAt.addingTimeInterval(TrackerManager.minUploadGap))
        let delay = max(5, due.timeIntervalSinceNow)
        retryTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { _ in
            self.retryTimer = nil
            self.flush(force: false)
        }
    }

    private func noteSuccess() {
        failureStreak = 0
        backoffUntil = .distantPast
        if dataReady {
            store.lastUploadError = nil
        }
    }

    private func noteFailure(_ words: String) {
        failureStreak += 1
        let wait = min(900, 30 * pow(2, Double(min(failureStreak - 1, 5))))
        backoffUntil = Date().addingTimeInterval(wait)
        if dataReady {
            store.lastUploadError = words
        }
        scheduleRetry()
        emitState()
    }

    private func rateLimited(_ r: ApiResponse) {
        rateLimitedUntil = Date().addingTimeInterval(r.retryAfter ?? 60)
        if dataReady {
            store.lastUploadError = "The server asked this phone to wait a minute. It will try again."
        }
        scheduleRetry()
        emitState()
    }

    private func isRevokedAnswer(_ r: ApiResponse) -> Bool {
        return r.status == 401 && (r.code == "DEVICE_REVOKED" || r.code == "DEVICE_UNAUTHORIZED")
    }

    private func hostName(_ base: String) -> String {
        return URL(string: base)?.host ?? base
    }

    private func applyConfig(_ raw: Any?) {
        guard dataReady, let json = raw as? [String: Any] else { return }
        let next = store.config.merged(with: json)
        if next != store.config {
            store.config = next
            adjustAccuracy()
        }
    }

    // MARK: - Heartbeat (D3)

    private var statusKey: String? {
        guard let notifications = notificationsAllowed else { return nil }
        let precise = preciseValue.map { $0 ? "1" : "0" } ?? "-"
        return [permissionString, precise, locationEnabled ? "1" : "0", notifications ? "1" : "0"].joined(separator: "|")
    }

    /// PERMISSION_CHANGED when permission, precision, Location Services or notifications changed.
    private func checkStatusChanged() {
        guard isPaired, let key = statusKey, let last = store.lastReportedStatus, last != key else { return }
        sendHeartbeat(event: "PERMISSION_CHANGED", force: true)
    }

    private func heartbeatIfDue() {
        guard isPaired, !heartbeatInFlight else { return }
        let last = store.lastHeartbeatAt ?? .distantPast
        if Date().timeIntervalSince(last) >= TimeInterval(store.config.heartbeatSeconds) {
            sendHeartbeat(event: "PERIODIC")
        }
    }

    private func statusBody(event: String) -> [String: Any] {
        var body: [String: Any] = [
            "permission": permissionString,
            "locationEnabled": locationEnabled,
            "trackingState": trackingStateString,
            "appVersion": DeviceInfo.appVersion,
            "osVersion": DeviceInfo.osVersion,
            "networkType": network.networkType,
            "queueSize": queue.count + heldPoints.count,
            "event": event,
        ]
        if let precise = preciseValue { body["preciseLocation"] = precise }
        if let notifications = notificationsAllowed { body["notificationsAllowed"] = notifications }
        let battery = DeviceInfo.battery()
        if let level = battery.level { body["batteryLevel"] = level }
        if let charging = battery.charging { body["isCharging"] = charging }
        if let token = store.pushToken {
            body["pushProvider"] = "APNS"
            body["pushToken"] = token
        }
        if event == "BOOT", let boot = DeviceInfo.bootTime() {
            body["bootedAt"] = Iso.string(boot)
        }
        return body
    }

    private func sendHeartbeat(event: String, force: Bool = false, completion: (() -> Void)? = nil) {
        guard let creds = credentials() else {
            completion?()
            return
        }
        let now = Date()
        if !force {
            if now < rateLimitedUntil {
                completion?()
                return
            }
            if let last = store.lastHeartbeatAt, now.timeIntervalSince(last) < 60 {
                completion?()
                return
            }
        }
        heartbeatInFlight = true
        let work = BackgroundWork.begin("orbit-heartbeat")
        refreshLocationServices {
            self.refreshNotificationSettings {
                let key = self.statusKey
                let body = self.statusBody(event: event)
                self.api.post(creds.base, "/api/device/heartbeat", token: creds.token, json: body) { result in
                    self.heartbeatInFlight = false
                    switch result {
                    case .transport:
                        self.noteFailure("Can't reach \(self.hostName(creds.base)). Will try again.")
                    case .response(let r):
                        if r.ok {
                            self.noteSuccess()
                            self.store.lastHeartbeatAt = Date()
                            if let key = key { self.store.lastReportedStatus = key }
                            if let sent = body["pushToken"] as? String { self.store.pushTokenSent = sent }
                            self.applyConfig(r.json?["config"])
                            self.handleLocateRequests(r.json?["locateRequests"], serverTime: r.json?["serverTime"] as? String)
                        } else if self.isRevokedAnswer(r) {
                            self.revokeLocally()
                        } else if r.status == 429 {
                            self.rateLimited(r)
                        } else {
                            self.noteFailure(r.message.map { "Server problem: \($0). Will try again." } ?? "The server answered \(r.status). Will try again.")
                        }
                    }
                    self.emitState()
                    work.end()
                    completion?()
                }
            }
        }
    }

    // MARK: - Push token (APNs)

    func didRegisterPushToken(_ token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        onMain {
            guard self.dataReady else { return }
            self.store.pushToken = hex
            // The launch heartbeat carries it when it has not gone yet.
            if self.isPaired && !self.launchHeartbeatPending && self.store.pushTokenSent != hex {
                self.sendHeartbeat(event: "PERIODIC", force: true)
            }
        }
    }

    func didFailToRegisterPush(_ error: Error) {
        // No APNs (simulator, missing entitlement, no network): Locate Now is then
        // answered at the next heartbeat or wake instead of at once.
    }

    // MARK: - Background refresh (BGAppRefreshTask; iOS decides when, if ever)

    func scheduleBackgroundRefresh() {
        guard isPaired else { return }
        let request = BGAppRefreshTaskRequest(identifier: TrackerManager.heartbeatTaskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: TimeInterval(store.config.heartbeatSeconds))
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Simulator, or Background App Refresh switched off for this app.
        }
    }

    private func runBackgroundRefresh(_ task: BGTask) {
        scheduleBackgroundRefresh()
        var finished = false
        let finish: (Bool) -> Void = { success in
            if finished { return }
            finished = true
            task.setTaskCompleted(success: success)
        }
        task.expirationHandler = {
            DispatchQueue.main.async {
                finish(false)
            }
        }
        guard dataReady, isPaired else {
            finish(true)
            return
        }
        sendHeartbeat(event: "PERIODIC") {
            self.flush(force: true) {
                finish(true)
            }
        }
    }
}
