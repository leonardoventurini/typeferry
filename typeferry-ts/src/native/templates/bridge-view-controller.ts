/**
 * Keeps Capacitor's existing UI delegate intact except for media permission decisions.
 */
export const BRIDGE_VIEW_CONTROLLER_SWIFT = String.raw`import AVFoundation
import Capacitor
import WebKit

@objc(TypeFerryBridgeViewController)
class TypeFerryBridgeViewController: CAPBridgeViewController {
    private var mediaDelegate: TypeFerryMediaDelegate?

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(TypeFerryNativePlugin())
        guard let webView = webView, let bridge = bridge else { return }
        let delegate = TypeFerryMediaDelegate(original: webView.uiDelegate, localURL: bridge.config.localURL)
        mediaDelegate = delegate
        webView.uiDelegate = delegate
    }
}

private final class TypeFerryMediaDelegate: NSObject, WKUIDelegate {
    private weak var original: WKUIDelegate?
    private let localURL: URL

    init(original: WKUIDelegate?, localURL: URL) {
        self.original = original
        self.localURL = localURL
        super.init()
    }

    override func responds(to selector: Selector!) -> Bool {
        super.responds(to: selector) || (original?.responds(to: selector) ?? false)
    }

    override func forwardingTarget(for selector: Selector!) -> Any? {
        if original?.responds(to: selector) == true { return original }
        return super.forwardingTarget(for: selector)
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        guard let requestURL = frame.request.url,
              TypeFerryMediaPolicy.isTrusted(localURL: localURL, requestURL: requestURL, isMainFrame: frame.isMainFrame),
              origin.protocol == localURL.scheme, origin.host == localURL.host,
              origin.port == (localURL.port ?? 0),
              webView.url.map({ TypeFerryMediaPolicy.isTrusted(localURL: localURL, requestURL: $0, isMainFrame: true) }) == true
        else { decisionHandler(.deny); return }

        let devices: [AVMediaType]
        switch type {
        case .camera: devices = [.video]
        case .microphone: devices = [.audio]
        case .cameraAndMicrophone: devices = [.video, .audio]
        @unknown default: decisionHandler(.deny); return
        }
        authorize(devices[...]) { [weak webView] decision in
            // A permission prompt can outlive navigation; never grant to a replacement page.
            guard let currentURL = webView?.url,
                  TypeFerryMediaPolicy.isTrusted(localURL: self.localURL, requestURL: currentURL, isMainFrame: true)
            else { decisionHandler(.deny); return }
            decisionHandler(decision)
        }
    }

    private func authorize(_ devices: ArraySlice<AVMediaType>, completion: @escaping (WKPermissionDecision) -> Void) {
        guard let device = devices.first else { completion(.grant); return }
        let usageKey = device == .video ? "NSCameraUsageDescription" : "NSMicrophoneUsageDescription"
        guard let explanation = Bundle.main.object(forInfoDictionaryKey: usageKey) as? String, !explanation.isEmpty
        else { completion(.deny); return }

        switch AVCaptureDevice.authorizationStatus(for: device) {
        case .authorized: authorize(devices.dropFirst(), completion: completion)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: device) { [weak self] granted in
                DispatchQueue.main.async {
                    guard granted, let self = self else { completion(.deny); return }
                    self.authorize(devices.dropFirst(), completion: completion)
                }
            }
        default: completion(.deny)
        }
    }
}
`
