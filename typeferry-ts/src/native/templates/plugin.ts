/**
 * Narrow Capacitor bridge: pinned backend requests, Keychain, system auth and sharing.
 */
export const NATIVE_PLUGIN_SWIFT = String.raw`import AuthenticationServices
import Capacitor
import UIKit

@objc(TypeFerryNativePlugin)
public class TypeFerryNativePlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "TypeFerryNativePlugin"
    public let jsName = "TypeFerryNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise)
    ]
    private var http: TypeFerryHTTPSession?
    private var initializationError: Error?
    private var authentication: ASWebAuthenticationSession?
    private var sharing = false
    private var observers: [NSObjectProtocol] = []

    public override func load() {
        do {
            guard let origin = getConfig().getString("backendOrigin"), let url = URL(string: origin),
                  url.host != nil, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
                  url.path.isEmpty || url.path == "/" else {
                throw TypeFerryHTTPSession.failure("A valid backend origin is required.")
            }
            var permitted = url.scheme == "https"
            #if DEBUG
            permitted = permitted || (url.scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(url.host ?? ""))
            #endif
            guard permitted else { throw TypeFerryHTTPSession.failure("The backend requires HTTPS.") }
            http = try TypeFerryHTTPSession(backendURL: url)
        } catch { initializationError = error }

        for name in [UIApplication.didBecomeActiveNotification, UIApplication.didEnterBackgroundNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.notifyListeners("appStateChange", data: ["isActive": UIApplication.shared.applicationState == .active])
            })
        }
    }

    deinit {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        authentication?.cancel()
    }

    @objc func request(_ call: CAPPluginCall) {
        do {
            let request = try makeRequest(call)
            guard let http = http else { throw initializationError ?? TypeFerryHTTPSession.failure("Native transport is unavailable.") }
            http.request(request) { result in
                switch result {
                case .success(let (data, response)):
                    guard let body = String(data: data, encoding: .utf8) else { call.reject("Native RPC responses must be UTF-8."); return }
                    var headers: [String: String] = [:]
                    for (key, value) in response.allHeaderFields {
                        guard let name = key as? String, name.lowercased() != "set-cookie" else { continue }
                        headers[name] = String(describing: value)
                    }
                    call.resolve(["status": response.statusCode, "statusText": HTTPURLResponse.localizedString(forStatusCode: response.statusCode), "headers": headers, "body": body])
                case .failure(let error): call.reject("The backend request failed.", nil, error)
                }
            }
        } catch { call.reject("The backend request was rejected.", nil, error) }
    }

    @objc func getSession(_ call: CAPPluginCall) {
        do {
            let data = try TypeFerryKeychain.read("session")
            call.resolve(["value": data.flatMap { String(data: $0, encoding: .utf8) } as Any? ?? NSNull()])
        } catch { call.reject("Unable to read the secure session.", nil, error) }
    }

    @objc func setSession(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), let data = value.data(using: .utf8), data.count <= 65_536 else {
            call.reject("A session value of at most 64 KiB is required."); return
        }
        do { try TypeFerryKeychain.write("session", data: data); call.resolve() }
        catch { call.reject("Unable to store the secure session.", nil, error) }
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        do {
            try http?.clearCookies()
            try TypeFerryKeychain.delete("session")
            call.resolve()
        } catch { call.reject("Unable to clear the secure session.", nil, error) }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["isActive": UIApplication.shared.applicationState == .active]) }
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        guard let urlValue = call.getString("url"), let url = URL(string: urlValue), http?.accepts(url) == true,
              let scheme = call.getString("callbackScheme"), scheme == getConfig().getString("callbackScheme"),
              !scheme.isEmpty, !["http", "https", "capacitor", "file", "javascript"].contains(scheme.lowercased()) else {
            call.reject("Untrusted authentication URL or callback scheme."); return
        }
        DispatchQueue.main.async {
            guard self.authentication == nil else { call.reject("Authentication is already running."); return }
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
                DispatchQueue.main.async {
                    self?.authentication = nil
                    guard let callback = callback, callback.scheme == scheme else {
                        call.reject("Authentication did not complete.", nil, error); return
                    }
                    call.resolve(["url": callback.absoluteString])
                }
            }
            session.presentationContextProvider = self
            self.authentication = session
            if !session.start() { self.authentication = nil; call.reject("Authentication could not start.") }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    @objc func shareFile(_ call: CAPPluginCall) {
        do {
            var request = try makeRequest(call)
            request.httpMethod = "GET"
            request.httpBody = nil
            guard let fileName = call.getString("fileName"), !fileName.isEmpty,
                  fileName == URL(fileURLWithPath: fileName).lastPathComponent,
                  ![".", ".."].contains(fileName), !fileName.contains("\\"),
                  let http = http else { throw TypeFerryHTTPSession.failure("A safe file name is required.") }
            DispatchQueue.main.async {
                guard !self.sharing else { call.reject("File sharing is already running."); return }
                self.sharing = true
                http.download(request) { result in
                    DispatchQueue.main.async {
                        switch result {
                        case .failure(let error): self.sharing = false; call.reject("The file could not be downloaded.", nil, error)
                        case .success(let temporary): self.presentShare(temporary, fileName: fileName, call: call)
                        }
                    }
                }
            }
        } catch { call.reject("The download was rejected.", nil, error) }
    }

    private func presentShare(_ temporary: URL, fileName: String, call: CAPPluginCall) {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let destination = directory.appendingPathComponent(fileName)
            try FileManager.default.moveItem(at: temporary, to: destination)
            guard let controller = bridge?.viewController, controller.presentedViewController == nil else {
                throw TypeFerryHTTPSession.failure("Close the active native dialog before sharing.")
            }
            let sheet = UIActivityViewController(activityItems: [destination], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = controller.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
            sheet.completionWithItemsHandler = { [weak self] _, completed, _, error in
                try? FileManager.default.removeItem(at: directory)
                self?.sharing = false
                if let error = error { call.reject("File sharing failed.", nil, error) }
                else { call.resolve(["completed": completed]) }
            }
            controller.present(sheet, animated: true)
        } catch {
            try? FileManager.default.removeItem(at: temporary)
            try? FileManager.default.removeItem(at: directory)
            sharing = false
            call.reject("The file could not be shared.", nil, error)
        }
    }

    private func makeRequest(_ call: CAPPluginCall) throws -> URLRequest {
        guard let value = call.getString("url"), let url = URL(string: value), http?.accepts(url) == true else {
            throw initializationError ?? TypeFerryHTTPSession.failure("Untrusted backend URL.")
        }
        var request = URLRequest(url: url)
        let method = call.getString("method") ?? "GET"
        guard ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].contains(method) else {
            throw TypeFerryHTTPSession.failure("Unsupported HTTP method.")
        }
        request.httpMethod = method
        request.httpBody = call.getString("body")?.data(using: .utf8)
        for (name, value) in call.getObject("headers") ?? [:] {
            guard let value = value as? String, !["cookie", "host", "origin", "content-length"].contains(name.lowercased()),
                  !name.contains("\r"), !name.contains("\n"), !value.contains("\r"), !value.contains("\n") else {
                throw TypeFerryHTTPSession.failure("Unsupported request header.")
            }
            request.setValue(value, forHTTPHeaderField: name)
        }
        return request
    }
}
`
