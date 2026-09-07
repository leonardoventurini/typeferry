/**
 * Same-origin native transport, with a private cookie jar persisted in Keychain.
 */
export const HTTP_SESSION_SWIFT = String.raw`import Foundation

final class TypeFerryHTTPSession: NSObject, URLSessionTaskDelegate {
    let backendURL: URL
    private let cookieAccount: String
    private var session: URLSession!
    private let cookieLock = NSLock()
    private var generation = 0

    init(backendURL: URL) throws {
        self.backendURL = backendURL
        cookieAccount = "cookies:" + backendURL.absoluteString
        super.init()

        let configuration = Self.makeConfiguration()
        if let data = try TypeFerryKeychain.read(cookieAccount),
           let rows = try PropertyListSerialization.propertyList(from: data, format: nil) as? [[String: Any]] {
            for row in rows {
                let properties = Dictionary(uniqueKeysWithValues: row.map { (HTTPCookiePropertyKey($0.key), $0.value) })
                if let cookie = HTTPCookie(properties: properties),
                   cookie.expiresDate.map({ $0 > Date() }) ?? true {
                    configuration.httpCookieStorage?.setCookie(cookie)
                }
            }
        }
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }

    func accepts(_ url: URL) -> Bool {
        TypeFerryMediaPolicy.isTrusted(localURL: backendURL, requestURL: url, isMainFrame: true)
    }

    func request(_ request: URLRequest, completion: @escaping (Result<(Data, HTTPURLResponse), Error>) -> Void) {
        guard let url = request.url, accepts(url) else { completion(.failure(Self.failure("Untrusted backend URL."))); return }
        let (requestSession, requestGeneration) = snapshot()
        requestSession.dataTask(with: request) { [weak self] data, response, error in
            if let error = error { completion(.failure(error)); return }
            guard let self = self, let response = response as? HTTPURLResponse, let data = data else {
                completion(.failure(Self.failure("The backend returned no response."))); return
            }
            do {
                try self.persistCookies(session: requestSession, generation: requestGeneration)
                completion(.success((data, response)))
            } catch { completion(.failure(error)) }
        }.resume()
    }

    func download(_ request: URLRequest, completion: @escaping (Result<URL, Error>) -> Void) {
        guard let url = request.url, accepts(url) else { completion(.failure(Self.failure("Untrusted download URL."))); return }
        let (requestSession, requestGeneration) = snapshot()
        requestSession.downloadTask(with: request) { [weak self] location, response, error in
            if let error = error { completion(.failure(error)); return }
            guard let self = self, let location = location, let response = response as? HTTPURLResponse,
                  (200..<300).contains(response.statusCode) else {
                completion(.failure(Self.failure("The download failed."))); return
            }
            do {
                try self.persistCookies(session: requestSession, generation: requestGeneration)
                let retained = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                try FileManager.default.moveItem(at: location, to: retained)
                completion(.success(retained))
            } catch { completion(.failure(error)) }
        }.resume()
    }

    func clearCookies() throws {
        cookieLock.lock()
        defer { cookieLock.unlock() }
        let previous = session
        generation += 1
        // A fresh cookie jar prevents in-flight Set-Cookie from resurrecting logout.
        session = URLSession(configuration: Self.makeConfiguration(), delegate: self, delegateQueue: nil)
        previous?.invalidateAndCancel()
        try TypeFerryKeychain.delete(cookieAccount)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let url = request.url, accepts(url) else { completionHandler(nil); return }
        completionHandler(request)
    }

    private func snapshot() -> (URLSession, Int) {
        cookieLock.lock()
        defer { cookieLock.unlock() }
        return (session, generation)
    }

    private static func makeConfiguration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = true
        configuration.timeoutIntervalForRequest = 60
        configuration.timeoutIntervalForResource = 300
        return configuration
    }

    private func persistCookies(session: URLSession, generation: Int) throws {
        cookieLock.lock()
        defer { cookieLock.unlock() }
        guard generation == self.generation else { throw Self.failure("The native session was cleared.") }
        let rows = (session.configuration.httpCookieStorage?.cookies ?? []).compactMap { cookie -> [String: Any]? in
            guard let properties = cookie.properties else { return nil }
            return Dictionary(uniqueKeysWithValues: properties.map { ($0.key.rawValue, $0.value) })
        }
        let data = try PropertyListSerialization.data(fromPropertyList: rows, format: .binary, options: 0)
        try TypeFerryKeychain.write(cookieAccount, data: data)
    }

    static func failure(_ message: String) -> NSError {
        NSError(domain: "TypeFerryNative", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
`
