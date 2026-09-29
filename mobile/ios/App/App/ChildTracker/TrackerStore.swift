// Orbit Child (iOS) — what the tracker remembers between launches.
//
// - The device TOKEN lives only in the Keychain (generic password,
//   kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly, so a background relaunch
//   after the first unlock can read it, and it never leaves this phone in a
//   backup). It is never handed to JavaScript.
// - Everything else (server address, device id, child's first name, times of the
//   last fix / upload / heartbeat, the server's config) is in UserDefaults.
//
// Writes to UserDefaults only happen after the phone's first unlock (the
// caller checks `dataReady`): before that, iOS can report the store as empty,
// and writing then could replace the real values.

import Foundation
import Security

/// The server's DeviceConfig (plan section 5). Out-of-range values are ignored.
struct DeviceConfig: Codable, Equatable {
    var heartbeatSeconds: Int = 900
    var movingIntervalSeconds: Int = 120
    var stationaryIntervalSeconds: Int = 900
    var distanceFilterMeters: Double = 50
    var locateTimeoutSeconds: Int = 30
    var maxBatch: Int = 200

    static let standard = DeviceConfig()

    func merged(with json: [String: Any]?) -> DeviceConfig {
        guard let json = json else { return self }
        var next = self
        func int(_ key: String, _ range: ClosedRange<Int>) -> Int? {
            guard let number = json[key] as? NSNumber else { return nil }
            let value = number.intValue
            return range.contains(value) ? value : nil
        }
        if let v = int("heartbeatSeconds", 60...86_400) { next.heartbeatSeconds = v }
        if let v = int("movingIntervalSeconds", 5...3_600) { next.movingIntervalSeconds = v }
        if let v = int("stationaryIntervalSeconds", 60...86_400) { next.stationaryIntervalSeconds = v }
        if let v = int("locateTimeoutSeconds", 5...120) { next.locateTimeoutSeconds = v }
        if let v = int("maxBatch", 1...200) { next.maxBatch = v }
        if let number = json["distanceFilterMeters"] as? NSNumber, (5.0...5_000.0).contains(number.doubleValue) {
            next.distanceFilterMeters = number.doubleValue
        }
        return next
    }
}

/// The device token in the Keychain.
enum DeviceKeychain {
    enum Read {
        case value(String)
        case missing
        /// The Keychain is locked (before the first unlock after a restart) or failed.
        case unavailable(OSStatus)
    }

    private static let service = "com.sgroup.orbit.child.device"
    private static let account = "deviceToken"

    private static var baseQuery: [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func save(_ token: String) -> Bool {
        delete()
        var query = baseQuery
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        query[kSecValueData as String] = Data(token.utf8)
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    static func read() -> Read {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &out)
        switch status {
        case errSecSuccess:
            if let data = out as? Data, let token = String(data: data, encoding: .utf8), !token.isEmpty {
                return .value(token)
            }
            return .missing
        case errSecItemNotFound:
            return .missing
        default:
            return .unavailable(status)
        }
    }

    static func delete() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}

/// UserDefaults + Keychain. Main thread.
final class TrackerStore {
    private let defaults = UserDefaults.standard
    private var tokenCache: String?

    private enum Key {
        static let serverUrl = "orbit.serverUrl"
        static let deviceId = "orbit.deviceId"
        static let personName = "orbit.personName"
        static let revoked = "orbit.revoked"
        static let config = "orbit.config"
        static let lastFixAt = "orbit.lastFixAt"
        static let lastQueuedAt = "orbit.lastQueuedAt"
        static let lastUploadAt = "orbit.lastUploadAt"
        static let lastUploadError = "orbit.lastUploadError"
        static let lastHeartbeatAt = "orbit.lastHeartbeatAt"
        static let lastReportedStatus = "orbit.lastReportedStatus"
        static let pushToken = "orbit.pushToken"
        static let pushTokenSent = "orbit.pushTokenSent"
        static let lastBootTime = "orbit.lastBootTime"
        static let handledLocates = "orbit.handledLocates"
        static let installed = "orbit.installed"
    }

    // MARK: Keychain

    enum Token {
        case value(String)
        case missing
        case locked
    }

    func deviceToken() -> Token {
        if let token = tokenCache { return .value(token) }
        switch DeviceKeychain.read() {
        case .value(let token):
            tokenCache = token
            return .value(token)
        case .missing:
            return .missing
        case .unavailable:
            return .locked
        }
    }

    func saveToken(_ token: String) -> Bool {
        let ok = DeviceKeychain.save(token)
        tokenCache = ok ? token : nil
        return ok
    }

    func clearToken() {
        DeviceKeychain.delete()
        tokenCache = nil
    }

    // MARK: UserDefaults

    var serverUrl: String? {
        get { return defaults.string(forKey: Key.serverUrl) }
        set { put(newValue, Key.serverUrl) }
    }

    var deviceId: String? {
        get { return defaults.string(forKey: Key.deviceId) }
        set { put(newValue, Key.deviceId) }
    }

    var personName: String? {
        get { return defaults.string(forKey: Key.personName) }
        set { put(newValue, Key.personName) }
    }

    var revoked: Bool {
        get { return defaults.bool(forKey: Key.revoked) }
        set { defaults.set(newValue, forKey: Key.revoked) }
    }

    var installed: Bool {
        get { return defaults.bool(forKey: Key.installed) }
        set { defaults.set(newValue, forKey: Key.installed) }
    }

    var config: DeviceConfig {
        get {
            guard let data = defaults.data(forKey: Key.config),
                  let config = try? JSONDecoder().decode(DeviceConfig.self, from: data) else {
                return .standard
            }
            return config
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) {
                defaults.set(data, forKey: Key.config)
            }
        }
    }

    var lastFixAt: Date? {
        get { return date(Key.lastFixAt) }
        set { putDate(newValue, Key.lastFixAt) }
    }

    var lastQueuedAt: Date? {
        get { return date(Key.lastQueuedAt) }
        set { putDate(newValue, Key.lastQueuedAt) }
    }

    var lastUploadAt: Date? {
        get { return date(Key.lastUploadAt) }
        set { putDate(newValue, Key.lastUploadAt) }
    }

    var lastUploadError: String? {
        get { return defaults.string(forKey: Key.lastUploadError) }
        set { put(newValue, Key.lastUploadError) }
    }

    var lastHeartbeatAt: Date? {
        get { return date(Key.lastHeartbeatAt) }
        set { putDate(newValue, Key.lastHeartbeatAt) }
    }

    /// "permission|precise|enabled|notifications" as last told to the server.
    var lastReportedStatus: String? {
        get { return defaults.string(forKey: Key.lastReportedStatus) }
        set { put(newValue, Key.lastReportedStatus) }
    }

    var pushToken: String? {
        get { return defaults.string(forKey: Key.pushToken) }
        set { put(newValue, Key.pushToken) }
    }

    var pushTokenSent: String? {
        get { return defaults.string(forKey: Key.pushTokenSent) }
        set { put(newValue, Key.pushTokenSent) }
    }

    var lastBootTime: Date? {
        get { return date(Key.lastBootTime) }
        set { putDate(newValue, Key.lastBootTime) }
    }

    /// Locate Now requests already answered (id → when), kept one day.
    func wasHandled(_ requestId: String) -> Bool {
        return handledLocates()[requestId] != nil
    }

    func markHandled(_ requestId: String) {
        var map = handledLocates()
        let now = Date().timeIntervalSince1970
        map = map.filter { now - $0.value < 86_400 }
        map[requestId] = now
        defaults.set(map, forKey: Key.handledLocates)
    }

    /// Forget the pairing (the phone was removed, or it is being paired again).
    func clearPairing(keepServer: Bool) {
        clearToken()
        if !keepServer { serverUrl = nil }
        deviceId = nil
        personName = nil
        lastUploadError = nil
        lastUploadAt = nil
        lastHeartbeatAt = nil
        lastReportedStatus = nil
        pushTokenSent = nil
        lastQueuedAt = nil
        defaults.removeObject(forKey: Key.handledLocates)
    }

    private func handledLocates() -> [String: Double] {
        return defaults.dictionary(forKey: Key.handledLocates) as? [String: Double] ?? [:]
    }

    private func put(_ value: String?, _ key: String) {
        if let value = value {
            defaults.set(value, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }

    private func date(_ key: String) -> Date? {
        guard defaults.object(forKey: key) != nil else { return nil }
        return Date(timeIntervalSince1970: defaults.double(forKey: key))
    }

    private func putDate(_ value: Date?, _ key: String) {
        if let value = value {
            defaults.set(value.timeIntervalSince1970, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }
}
