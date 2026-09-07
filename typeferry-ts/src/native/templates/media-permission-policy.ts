/**
 * Foundation-only origin policy, also executed by the native security tests.
 */
export const MEDIA_PERMISSION_POLICY_SWIFT = String.raw`import Foundation

struct TypeFerryMediaPolicy {
    static func isTrusted(localURL: URL, requestURL: URL, isMainFrame: Bool) -> Bool {
        guard isMainFrame, requestURL.user == nil, requestURL.password == nil else { return false }
        return localURL.scheme?.lowercased() == requestURL.scheme?.lowercased()
            && localURL.host?.lowercased() == requestURL.host?.lowercased()
            && effectivePort(localURL) == effectivePort(requestURL)
    }

    private static func effectivePort(_ url: URL) -> Int? {
        if let port = url.port { return port }
        switch url.scheme?.lowercased() {
        case "https": return 443
        case "http": return 80
        default: return nil
        }
    }
}
`
