// Orbit Child (iOS) — the on-disk queue every fix goes into FIRST.
//
// JSON lines in Application Support/OrbitChild/location-queue.jsonl.
// - append: one line, then fsync (FileHandle.synchronize) before we report success.
// - remove / trim: the whole file is written to a temp file, fsynced, then
//   renamed over the old one (atomic on APFS), then the directory is fsynced.
// - A line torn by a crash mid-write is dropped on the next load (never repaired
//   by guessing), and the file is rewritten clean.
// - File protection "until first user authentication" so a background wake
//   while the phone is locked (after its first unlock) can still write.
// - Excluded from iCloud/iTunes backups: positions stay on this phone until sent.
//
// All file work runs on one private serial queue; completions come back on main.

import Foundation

/// One DevicePointIn (plan section 5). Optional fields are left out when nil.
struct QueuedPoint: Codable {
    let clientId: String
    let lat: Double
    let lng: Double
    let accuracy: Double?
    let altitude: Double?
    let speed: Double?
    let heading: Double?
    let recordedAt: String
    let trigger: String
    let locateRequestId: String?
    let batteryLevel: Int?
    let isCharging: Bool?
    let networkType: String?
}

final class LocationQueue {
    /// Beyond this many unsent fixes (weeks offline) the oldest are dropped;
    /// the server refuses fixes older than 30 days anyway.
    static let maxRows = 20_000

    private let io = DispatchQueue(label: "com.sgroup.orbit.child.queue")
    private let dir: URL
    private let file: URL
    private let tmp: URL
    private var rows: [QueuedPoint]?          // io queue only
    private let countLock = NSLock()
    private var countValue = 0

    private static let protection: [FileAttributeKey: Any] = [
        .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication,
    ]

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support", isDirectory: true)
        dir = base.appendingPathComponent("OrbitChild", isDirectory: true)
        file = dir.appendingPathComponent("location-queue.jsonl")
        tmp = dir.appendingPathComponent("location-queue.jsonl.tmp")
    }

    /// Rows waiting to be sent (as last loaded). Any thread.
    var count: Int {
        countLock.lock()
        defer { countLock.unlock() }
        return countValue
    }

    /// Reads the file once so `count` is right. Completion on main.
    func load(completion: (() -> Void)? = nil) {
        io.async {
            _ = self.loaded()
            DispatchQueue.main.async { completion?() }
        }
    }

    /// Writes one fix to disk. `true` only once it is on disk.
    func append(_ point: QueuedPoint, completion: @escaping (Bool) -> Void) {
        io.async {
            let ok = self.appendOnDisk(point)
            DispatchQueue.main.async { completion(ok) }
        }
    }

    /// Up to `max` rows: Locate Now fixes first, then oldest first.
    func peek(max: Int, completion: @escaping ([QueuedPoint]) -> Void) {
        io.async {
            let all = self.loaded() ?? []
            let urgent = all.filter { $0.trigger == "LOCATE_NOW" }
            let rest = all.filter { $0.trigger != "LOCATE_NOW" }
            let batch = Array((urgent + rest).prefix(Swift.max(1, max)))
            DispatchQueue.main.async { completion(batch) }
        }
    }

    /// Deletes the rows the server has answered for.
    func remove(_ clientIds: Set<String>, completion: (() -> Void)? = nil) {
        io.async {
            if var all = self.loaded() {
                all.removeAll { clientIds.contains($0.clientId) }
                // If the rewrite fails the rows stay on disk and are sent again later;
                // the server counts them as duplicates (same clientId).
                _ = self.rewrite(all)
                self.rows = all
                self.setCount(all.count)
            }
            DispatchQueue.main.async { completion?() }
        }
    }

    /// Empties the queue (the phone was removed, or paired again).
    func clear(completion: (() -> Void)? = nil) {
        io.async {
            self.rows = []
            self.setCount(0)
            try? FileManager.default.removeItem(at: self.file)
            try? FileManager.default.removeItem(at: self.tmp)
            DispatchQueue.main.async { completion?() }
        }
    }

    // MARK: io queue only

    private func setCount(_ value: Int) {
        countLock.lock()
        countValue = value
        countLock.unlock()
    }

    /// The rows, reading the file the first time. nil when the file cannot be
    /// read (before the phone's first unlock).
    private func loaded() -> [QueuedPoint]? {
        if let rows = rows { return rows }
        guard FileManager.default.fileExists(atPath: file.path) else {
            rows = []
            setCount(0)
            return []
        }
        guard let data = try? Data(contentsOf: file) else { return nil }
        let decoder = JSONDecoder()
        var out: [QueuedPoint] = []
        var bad = 0
        for line in data.split(separator: UInt8(ascii: "\n")) where !line.isEmpty {
            if let point = try? decoder.decode(QueuedPoint.self, from: Data(line)) {
                out.append(point)
            } else {
                bad += 1
            }
        }
        rows = out
        setCount(out.count)
        let endsClean = data.isEmpty || data.last == UInt8(ascii: "\n")
        if bad > 0 || !endsClean {
            _ = rewrite(out)
        }
        return out
    }

    private func appendOnDisk(_ point: QueuedPoint) -> Bool {
        guard var all = loaded() else { return false }
        do {
            try ensureDir()
            var line = try JSONEncoder().encode(point)
            line.append(UInt8(ascii: "\n"))
            if !FileManager.default.fileExists(atPath: file.path) {
                guard FileManager.default.createFile(atPath: file.path, contents: nil, attributes: LocationQueue.protection) else {
                    return false
                }
            }
            let handle = try FileHandle(forWritingTo: file)
            defer { try? handle.close() }
            _ = try handle.seekToEnd()
            try handle.write(contentsOf: line)
            try handle.synchronize()
            all.append(point)
            if all.count > LocationQueue.maxRows {
                all.removeFirst(all.count - LocationQueue.maxRows)
                _ = rewrite(all)
            }
            rows = all
            setCount(all.count)
            return true
        } catch {
            return false
        }
    }

    /// Temp file + fsync + rename + directory fsync.
    private func rewrite(_ all: [QueuedPoint]) -> Bool {
        do {
            try ensureDir()
            let encoder = JSONEncoder()
            var data = Data()
            for point in all {
                data.append(try encoder.encode(point))
                data.append(UInt8(ascii: "\n"))
            }
            try? FileManager.default.removeItem(at: tmp)
            guard FileManager.default.createFile(atPath: tmp.path, contents: nil, attributes: LocationQueue.protection) else {
                return false
            }
            let handle = try FileHandle(forWritingTo: tmp)
            try handle.write(contentsOf: data)
            try handle.synchronize()
            try handle.close()
            guard Darwin.rename(tmp.path, file.path) == 0 else { return false }
            let fd = Darwin.open(dir.path, O_RDONLY)
            if fd >= 0 {
                _ = Darwin.fsync(fd)
                _ = Darwin.close(fd)
            }
            return true
        } catch {
            return false
        }
    }

    private func ensureDir() throws {
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: LocationQueue.protection)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var url = dir
            try? url.setResourceValues(values)
        }
    }
}
