/**
 * Native-only secrets survive application upgrades without entering web storage.
 */
export const KEYCHAIN_SWIFT = String.raw`import Foundation
import Security

struct TypeFerryKeychain {
    static func read(_ account: String) throws -> Data? {
        var query = baseQuery(account)
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw failure(status) }
        return result as? Data
    }

    static func write(_ account: String, data: Data) throws {
        let query = baseQuery(account)
        let updates: [CFString: Any] = [kSecValueData: data]
        let status = SecItemUpdate(query as CFDictionary, updates as CFDictionary)
        if status == errSecItemNotFound {
            var insertion = query
            insertion[kSecValueData] = data
            insertion[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            let insertStatus = SecItemAdd(insertion as CFDictionary, nil)
            guard insertStatus == errSecSuccess else { throw failure(insertStatus) }
        } else if status != errSecSuccess { throw failure(status) }
    }

    static func delete(_ account: String) throws {
        let status = SecItemDelete(baseQuery(account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw failure(status) }
    }

    private static func baseQuery(_ account: String) -> [CFString: Any] {
        [kSecClass: kSecClassGenericPassword,
         kSecAttrService: (Bundle.main.bundleIdentifier ?? "typeferry") + ".typeferry",
         kSecAttrAccount: account]
    }

    private static func failure(_ status: OSStatus) -> NSError {
        NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Secure session storage is unavailable."])
    }
}
`
