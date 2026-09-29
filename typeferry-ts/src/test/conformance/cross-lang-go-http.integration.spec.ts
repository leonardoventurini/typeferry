import { type ChildProcess, spawn } from 'node:child_process'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Client } from '../../client'
import { ClientHttp } from '../../client/client-http'

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const GO_DIR = path.join(REPO_ROOT, 'typeferry-go')

describe('TypeScript HTTP client ↔ Go server', () => {
  let process: ChildProcess
  let port: number

  beforeAll(async () => {
    process = spawn('go', ['run', './cmd/typeferry-conformance-server'], {
      cwd: GO_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Go server startup timed out')), 30_000)
      let output = ''
      process.stderr?.on('data', chunk => {
        output += chunk.toString('utf8')
        const match = output.match(/TYPEFERRY_PORT=(\d+)/)
        if (match) {
          clearTimeout(timeout)
          resolve(Number.parseInt(match[1]!, 10))
        }
      })
      process.once('error', reject)
      process.once('exit', code => reject(new Error(`Go server exited with ${code}`)))
    })
  }, 35_000)

  afterAll(() => {
    process?.kill('SIGTERM')
  })

  function clientHttp(token?: string): ClientHttp {
    const client = {
      options: { host: '127.0.0.1', port, secure: false },
      context: token ? { token } : {},
      uuid: 'go-http-client',
      logger: { method: () => undefined },
      emit: () => undefined,
    } as unknown as Client

    return new ClientHttp(client)
  }

  async function call(http: ClientHttp, method: string, params?: unknown): Promise<unknown> {
    return await new Promise((resolve, reject) => {
      void http.request({ method, params }, resolve, reject)
    })
  }

  it('calls methods through the real TypeScript HTTP client', async () => {
    expect(await call(clientHttp(), 'add', { a: 2, b: 3 })).toBe(5)
    expect(await call(clientHttp(), 'echo', { nested: { value: 7 } })).toEqual({ nested: { value: 7 } })
  })

  it('enforces protected methods and accepts the configured token', async () => {
    await expect(call(clientHttp(), 'whoami')).rejects.toMatchObject({ message: 'Method Forbidden' })
    expect(await call(clientHttp('good-token'), 'whoami')).toBe('u1')
  })
})
