import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { HTTP_SESSION_SWIFT } from './http-session'
import { MEDIA_PERMISSION_POLICY_SWIFT } from './media-permission-policy'

const run = promisify(execFile)

describe.runIf(process.platform === 'darwin')('native backend transport', () => {
  it('restores private cookies and blocks cross-origin redirects', async () => {
    let leakedRequests = 0
    const outside = createServer((_request, response) => {
      leakedRequests += 1
      response.end('leaked')
    })
    await new Promise<void>(resolve => outside.listen(0, '127.0.0.1', resolve))
    const outsideAddress = outside.address()

    if (!outsideAddress || typeof outsideAddress === 'string') throw new Error('Missing test address')

    const server = createServer((request, response) => {
      if (request.url === '/delayed') {
        setTimeout(() => {
          response.setHeader('Set-Cookie', 'refresh=resurrected; HttpOnly; Path=/')
          response.end('late')
        }, 200)
        return
      }
      if (request.url === '/set') response.setHeader('Set-Cookie', 'refresh=secret; HttpOnly; Path=/')
      if (request.url === '/redirect') {
        response.statusCode = 302
        response.setHeader('Location', `http://127.0.0.1:${outsideAddress.port}/outside`)
      }
      response.end(request.headers.cookie ?? '')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()

    if (!address || typeof address === 'string') throw new Error('Missing test address')

    const directory = await mkdtemp(join(tmpdir(), 'typeferry-native-http-'))
    const file = join(directory, 'main.swift')
    const source = `${MEDIA_PERMISSION_POLICY_SWIFT}\n${HTTP_SESSION_SWIFT}\n` + String.raw`
struct TypeFerryKeychain {
    static var values: [String: Data] = [:]
    static func read(_ account: String) throws -> Data? { values[account] }
    static func write(_ account: String, data: Data) throws { values[account] = data }
    static func delete(_ account: String) throws { values.removeValue(forKey: account) }
}
let base = URL(string: CommandLine.arguments[1])!
func fetch(_ client: TypeFerryHTTPSession, _ path: String) -> (Data, HTTPURLResponse) {
    let semaphore = DispatchSemaphore(value: 0)
    var result: Result<(Data, HTTPURLResponse), Error>?
    client.request(URLRequest(url: base.appendingPathComponent(path))) {
        result = $0
        semaphore.signal()
    }
    assert(semaphore.wait(timeout: .now() + 10) == .success)
    return try! result!.get()
}
let original = try TypeFerryHTTPSession(backendURL: base)
_ = fetch(original, "set")
let restored = try TypeFerryHTTPSession(backendURL: base)
assert(String(data: fetch(restored, "check").0, encoding: .utf8) == "refresh=secret")
assert(fetch(restored, "redirect").1.statusCode == 302)
let pending = DispatchSemaphore(value: 0)
var lateResult: Result<(Data, HTTPURLResponse), Error>?
restored.request(URLRequest(url: base.appendingPathComponent("delayed"))) {
    lateResult = $0
    pending.signal()
}
Thread.sleep(forTimeInterval: 0.05)
try restored.clearCookies()
assert(pending.wait(timeout: .now() + 10) == .success)
if case .success = lateResult { fatalError("A logged-out request must not succeed") }
let afterLogout = try TypeFerryHTTPSession(backendURL: base)
assert(String(data: fetch(afterLogout, "check").0, encoding: .utf8) == "")
assert(String(data: fetch(restored, "check").0, encoding: .utf8) == "")
`

    try {
      await writeFile(file, source)
      await run('swift', [file, `http://127.0.0.1:${address.port}`], { timeout: 30_000 })
      expect(leakedRequests).toBe(0)
    } finally {
      await Promise.all([
        new Promise<void>(resolve => server.close(() => resolve())),
        new Promise<void>(resolve => outside.close(() => resolve())),
        rm(directory, { recursive: true, force: true }),
      ])
    }
  }, 40_000)
})
