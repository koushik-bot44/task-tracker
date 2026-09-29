// Orbit Child (iOS) — small facts about the phone, the network, time stamps and
// background time. Nothing here invents a value: anything iOS cannot tell us is nil.
//
// Contract: records/plans/device-tracking-plan.md, sections 5 and 7.

import Foundation
import UIKit
import Network

/// Runs `work` on the main thread (at once when already there).
func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
        work()
    } else {
        DispatchQueue.main.async(execute: work)
    }
}

enum DeviceInfo {
    /// The hardware model identifier, e.g. "iPhone15,2" (utsname.machine).
    static var model: String {
        var info = utsname()
        uname(&info)
        let machine = withUnsafeBytes(of: info.machine) { raw -> String in
            String(decoding: raw.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
        return machine.isEmpty ? "iPhone" : machine
    }

    /// "1.0 (7)" — marketing version and build number.
    static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "0"
        let build = info?["CFBundleVersion"] as? String ?? "0"
        return "\(short) (\(build))"
    }

    /// "iOS 18.2". Main thread.
    static var osVersion: String {
        return "iOS " + UIDevice.current.systemVersion
    }

    /// The phone's name as iOS gives it to apps (since iOS 16 usually just "iPhone"). Main thread.
    static var deviceName: String {
        return UIDevice.current.name
    }

    struct Battery {
        let level: Int?
        let charging: Bool?
    }

    /// Battery level 0–100 and charging state; nil when iOS does not know. Main thread.
    static func battery() -> Battery {
        let device = UIDevice.current
        if !device.isBatteryMonitoringEnabled {
            device.isBatteryMonitoringEnabled = true
        }
        let raw = device.batteryLevel
        let level: Int? = raw < 0 ? nil : min(100, max(0, Int((raw * 100).rounded())))
        let charging: Bool?
        switch device.batteryState {
        case .charging, .full:
            charging = true
        case .unplugged:
            charging = false
        default:
            charging = nil
        }
        return Battery(level: level, charging: charging)
    }

    /// When the phone last started, read from the kernel (sysctl kern.boottime).
    /// Used only to tell the family "the phone was restarted" (heartbeat event BOOT).
    static func bootTime() -> Date? {
        var tv = timeval()
        var size = MemoryLayout<timeval>.stride
        let rc = sysctlbyname("kern.boottime", &tv, &size, nil, 0)
        guard rc == 0, tv.tv_sec > 0 else { return nil }
        return Date(timeIntervalSince1970: TimeInterval(tv.tv_sec) + TimeInterval(tv.tv_usec) / 1_000_000)
    }
}

/// ISO-8601 with milliseconds, always UTC ("2026-09-29T10:15:30.123Z").
enum Iso {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func string(_ date: Date) -> String {
        return withFraction.string(from: date)
    }

    static func date(_ text: String) -> Date? {
        return withFraction.date(from: text) ?? plain.date(from: text)
    }
}

/// WIFI / CELLULAR / NONE / UNKNOWN from NWPathMonitor.
final class NetworkMonitor {
    static let shared = NetworkMonitor()

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.sgroup.orbit.child.network")
    private let lock = NSLock()
    private var current = "UNKNOWN"
    private var started = false

    /// Called on the main thread when the phone goes from no network to some network.
    var onBecameReachable: (() -> Void)?

    /// Main thread.
    func start() {
        guard !started else { return }
        started = true
        monitor.pathUpdateHandler = { [weak self] path in
            self?.update(path)
        }
        monitor.start(queue: monitorQueue)
    }

    var networkType: String {
        lock.lock()
        defer { lock.unlock() }
        return current
    }

    private func update(_ path: NWPath) {
        let next: String
        if path.status != .satisfied {
            next = "NONE"
        } else if path.usesInterfaceType(.wifi) {
            next = "WIFI"
        } else if path.usesInterfaceType(.cellular) {
            next = "CELLULAR"
        } else {
            next = "UNKNOWN"
        }
        lock.lock()
        let before = current
        current = next
        lock.unlock()
        if before == "NONE" && next != "NONE" {
            DispatchQueue.main.async { [weak self] in
                self?.onBecameReachable?()
            }
        }
    }
}

/// A UIApplication background task: asks iOS for a little time so an upload
/// started just before the app is suspended can finish. `end()` is safe to call twice.
final class BackgroundWork {
    private var taskId: UIBackgroundTaskIdentifier = .invalid
    private let lock = NSLock()

    static func begin(_ name: String) -> BackgroundWork {
        let work = BackgroundWork()
        let id = UIApplication.shared.beginBackgroundTask(withName: name) {
            // iOS is out of patience: give the time back. Nothing is lost —
            // every fix is already in the on-disk queue and is sent next time.
            work.end()
        }
        work.lock.lock()
        work.taskId = id
        work.lock.unlock()
        return work
    }

    func end() {
        lock.lock()
        let id = taskId
        taskId = .invalid
        lock.unlock()
        if id != .invalid {
            UIApplication.shared.endBackgroundTask(id)
        }
    }
}
