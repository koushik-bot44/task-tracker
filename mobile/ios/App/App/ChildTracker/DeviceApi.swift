// Orbit Child (iOS) — the device API client (plan section 5, D1–D4).
//
// JSON over HTTPS with URLSession. The device token goes in the Authorization
// header and nowhere else. Errors come back as { error, code }; codes the app
// acts on: PAIRING_INVALID, RATE_LIMITED, DEVICE_REVOKED, DEVICE_UNAUTHORIZED.
// Completions are delivered on the main thread.

import Foundation

struct ApiResponse {
    let status: Int
    let json: [String: Any]?
    let retryAfter: TimeInterval?

    var ok: Bool { return (200..<300).contains(status) }
    var code: String? { return json?["code"] as? String }
    var message: String? { return json?["error"] as? String }
}

enum ApiResult {
    case response(ApiResponse)
    case transport(Error)
}

final class DeviceApi {
    private let session: URLSession

    init() {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 25
        config.waitsForConnectivity = false
        config.httpAdditionalHeaders = [
            "Accept": "application/json",
            "User-Agent": "OrbitChild-iOS/\(DeviceInfo.appVersion)",
        ]
        session = URLSession(configuration: config)
    }

    /// POST `json` to `base + path`. `token` nil only for pairing.
    func post(_ base: String, _ path: String, token: String?, json: Any, completion: @escaping (ApiResult) -> Void) {
        guard let body = try? JSONSerialization.data(withJSONObject: json, options: []) else {
            completion(.transport(URLError(.cannotParseResponse)))
            return
        }
        post(base, path, token: token, body: body, completion: completion)
    }

    func post(_ base: String, _ path: String, token: String?, body: Data, completion: @escaping (ApiResult) -> Void) {
        guard let url = URL(string: base + path) else {
            DispatchQueue.main.async { completion(.transport(URLError(.badURL))) }
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let task = session.dataTask(with: request) { data, response, error in
            let result: ApiResult
            if let http = response as? HTTPURLResponse {
                var parsed: [String: Any]?
                if let data = data, !data.isEmpty {
                    parsed = (try? JSONSerialization.jsonObject(with: data, options: [])) as? [String: Any]
                }
                var retryAfter: TimeInterval?
                if let header = http.value(forHTTPHeaderField: "Retry-After"), let seconds = TimeInterval(header.trimmingCharacters(in: .whitespaces)) {
                    retryAfter = seconds
                }
                result = .response(ApiResponse(status: http.statusCode, json: parsed, retryAfter: retryAfter))
            } else {
                result = .transport(error ?? URLError(.badServerResponse))
            }
            DispatchQueue.main.async { completion(result) }
        }
        task.resume()
    }
}
