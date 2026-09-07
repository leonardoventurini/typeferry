/**
 * Process-wide ownership keeps independent scene/presentation leases isolated.
 */
export const WAKE_LOCKS_SWIFT = String.raw`import Foundation

final class TypeFerryWakeLocks {
    private var leases: [String: String] = [:]
    private var activeOwners: Set<String> = []
    private var enabled = false
    private let apply: (Bool) -> Void

    init(apply: @escaping (Bool) -> Void) { self.apply = apply }

    func setActive(owner: String, active: Bool) {
        if active { activeOwners.insert(owner) }
        else { activeOwners.remove(owner) }
        update()
    }

    func acquire(owner: String) -> String {
        let id = UUID().uuidString
        leases[id] = owner
        update()
        return id
    }

    func release(id: String, owner: String) {
        guard leases[id] == owner else { return }
        leases.removeValue(forKey: id)
        update()
    }

    func removeOwner(_ owner: String) {
        leases = leases.filter { $0.value != owner }
        activeOwners.remove(owner)
        update()
    }

    private func update() {
        let next = leases.values.contains { activeOwners.contains($0) }
        guard next != enabled else { return }
        enabled = next
        apply(next)
    }
}
`
