/**
 * Bounded, sequential native file staging independent of Capacitor and UIKit.
 */
export const FILE_STAGING_SWIFT = String.raw`import Foundation

final class TypeFerryFileStaging {
    static let maximumBytes = 128 * 1024 * 1024
    static let chunkBytes = 48 * 1024
    private struct Pending {
        let id: String
        let url: URL
        let name: String
        let size: Int
        let handle: FileHandle
        var offset: Int
    }
    private var pending: Pending?

    deinit {
        if let id = pending?.id { cancel(id: id) }
    }

    func contains(id: String) -> Bool { pending?.id == id }

    func begin(fileName: String, size: Int) throws -> String {
        guard pending == nil else { throw failure("Another file is already being prepared.") }
        guard size >= 0, size <= Self.maximumBytes else { throw failure("Files must be at most 128 MiB.") }
        guard !fileName.isEmpty, fileName.utf8.count <= 255,
              fileName == URL(fileURLWithPath: fileName).lastPathComponent,
              ![".", ".."].contains(fileName), !fileName.contains("\\"), !fileName.contains("\0")
        else { throw failure("A safe file name is required.") }

        let id = UUID().uuidString
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("typeferry-share-" + id)
        guard FileManager.default.createFile(atPath: url.path, contents: nil) else { throw failure("Unable to create a temporary file.") }
        do {
            let handle = try FileHandle(forWritingTo: url)
            pending = Pending(id: id, url: url, name: fileName, size: size, handle: handle, offset: 0)
            return id
        } catch {
            try? FileManager.default.removeItem(at: url)
            throw error
        }
    }

    func append(id: String, offset: Int, base64: String) throws {
        guard var current = pending, current.id == id else { throw failure("The pending file is unavailable.") }
        guard offset == current.offset, base64.utf8.count <= Self.chunkBytes / 3 * 4,
              let data = Data(base64Encoded: base64), !data.isEmpty, data.count <= Self.chunkBytes,
              data.count <= current.size - current.offset else { throw failure("Invalid file chunk or offset.") }
        try current.handle.write(contentsOf: data)
        current.offset += data.count
        pending = current
    }

    func finish(id: String) throws -> (url: URL, fileName: String) {
        guard let current = pending, current.id == id, current.offset == current.size else {
            throw failure("The pending file is incomplete.")
        }
        try current.handle.close()
        pending = nil
        return (current.url, current.name)
    }

    func cancel(id: String) {
        guard let current = pending, current.id == id else { return }
        pending = nil
        try? current.handle.close()
        try? FileManager.default.removeItem(at: current.url)
    }

    private func failure(_ message: String) -> NSError {
        NSError(domain: "TypeFerryFileStaging", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
`
