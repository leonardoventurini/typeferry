/**
 * Narrow Capacitor bridge: pinned backend requests, Keychain, system auth and sharing.
 */
export const NATIVE_PLUGIN_SWIFT = String.raw`import AuthenticationServices
import Capacitor
import UIKit
import WebKit

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
        CAPPluginMethod(name: "acquireWakeLock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releaseWakeLock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise)
    ]
    private var http: TypeFerryHTTPSession?
    private var initializationError: Error?
    private var authentication: ASWebAuthenticationSession?
    private var sharing = false
    private let fileStaging = TypeFerryFileStaging()
    private var stagingExpiry: DispatchWorkItem?
    private static let stagingTimeout: TimeInterval = 600
    private static let wakeLocks = TypeFerryWakeLocks { enabled in UIApplication.shared.isIdleTimerDisabled = enabled }
    private let wakeLockOwner = UUID().uuidString
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

        observers.append(NotificationCenter.default.addObserver(forName: .capacitorDecidePolicyForNavigationAction, object: nil, queue: .main) { [weak self] notification in
            guard let self = self, let webView = self.bridge?.webView,
                  let navigation = notification.object as? WKNavigationAction,
                  navigation.sourceFrame.webView === webView,
                  navigation.targetFrame?.isMainFrame == true else { return }
            Self.wakeLocks.removeOwner(self.wakeLockOwner)
        })

        for name in [UIApplication.didBecomeActiveNotification, UIApplication.didEnterBackgroundNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                guard let self = self else { return }
                let active = UIApplication.shared.applicationState == .active
                Self.wakeLocks.setActive(owner: self.wakeLockOwner, active: active)
                self.notifyListeners("appStateChange", data: ["isActive": active])
            })
        }
    }

    deinit {
        let owner = wakeLockOwner
        DispatchQueue.main.async { TypeFerryNativePlugin.wakeLocks.removeOwner(owner) }
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        authentication?.cancel()
        stagingExpiry?.cancel()
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

    @objc func acquireWakeLock(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard UIApplication.shared.applicationState == .active else {
                call.reject("The application must be active to keep the screen awake."); return
            }
            Self.wakeLocks.setActive(owner: self.wakeLockOwner, active: true)
            call.resolve(["id": Self.wakeLocks.acquire(owner: self.wakeLockOwner)])
        }
    }

    @objc func releaseWakeLock(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("A wake lock identifier is required."); return }
        DispatchQueue.main.async {
            Self.wakeLocks.release(id: id, owner: self.wakeLockOwner)
            call.resolve()
        }
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

    @objc func beginFile(_ call: CAPPluginCall) {
        guard let name = call.getString("fileName"), let size = call.getInt("size") else {
            call.reject("A file name and size are required."); return
        }
        DispatchQueue.main.async {
            guard !self.sharing else { call.reject("File sharing is already running."); return }
            do {
                let id = try self.fileStaging.begin(fileName: name, size: size)
                self.sharing = true
                self.extendStagingDeadline(id: id)
                call.resolve(["id": id])
            } catch { call.reject("The file could not be prepared.", nil, error) }
        }
    }

    @objc func appendFile(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let offset = call.getInt("offset"), let base64 = call.getString("base64") else {
            call.reject("A file identifier, offset and chunk are required."); return
        }
        DispatchQueue.main.async {
            do {
                try self.fileStaging.append(id: id, offset: offset, base64: base64)
                self.extendStagingDeadline(id: id)
                call.resolve()
            } catch {
                self.cancelStaging(id: id)
                call.reject("The file chunk could not be written.", nil, error)
            }
        }
    }

    @objc func finishFile(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("A file identifier is required."); return }
        DispatchQueue.main.async {
            do {
                let file = try self.fileStaging.finish(id: id)
                self.stagingExpiry?.cancel()
                self.stagingExpiry = nil
                self.presentShare(file.url, fileName: file.fileName, call: call)
            } catch {
                self.cancelStaging(id: id)
                call.reject("The file could not be completed.", nil, error)
            }
        }
    }

    @objc func cancelFile(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("A file identifier is required."); return }
        DispatchQueue.main.async {
            self.cancelStaging(id: id)
            call.resolve()
        }
    }

    private func cancelStaging(id: String) {
        guard fileStaging.contains(id: id) else { return }
        fileStaging.cancel(id: id)
        stagingExpiry?.cancel()
        stagingExpiry = nil
        sharing = false
    }

    private func extendStagingDeadline(id: String) {
        stagingExpiry?.cancel()
        let expiry = DispatchWorkItem { [weak self] in self?.cancelStaging(id: id) }
        stagingExpiry = expiry
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.stagingTimeout, execute: expiry)
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
