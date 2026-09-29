import { type ChildProcess, spawn } from 'node:child_process'
import path from 'node:path'
import WS from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Client } from '../../client'
import { ClientEvents } from '../../utils'

const GO_DIR = path.resolve(__dirname, '../../../../typeferry-go')

describe('TypeScript WebSocket client ↔ Go server', () => {
  let process: ChildProcess
  let port: number

  beforeAll(async () => {
    ;(globalThis as unknown as { WebSocket: typeof WS }).WebSocket = WS
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

  afterAll(() => process?.kill('SIGTERM'))

  async function newClient(token?: string): Promise<Client> {
    return await new Promise<Client>((resolve, reject) => {
      const client = new Client({ host: '127.0.0.1', port, ...(token ? { initialContext: { token } } : {}) })
      client.once(ClientEvents.INITIALIZED, () => resolve(client))
      client.once(ClientEvents.ERROR, reject)
    })
  }

  it('calls methods and reports authorization errors', async () => {
    const client = await newClient()
    try {
      expect(await client.call('add', { a: 2, b: 3 })).toBe(5)
      await expect(client.call('whoami')).rejects.toBeDefined()
    } finally {
      await client.close()
    }
  })

  it('authenticates and receives a channel event', async () => {
    const client = await newClient('good-token')
    try {
      expect(await client.call('whoami')).toBe('u1')
      const channel = client.channel('room-go')!
      const received = new Promise(resolve => channel.once('ping.tick', resolve))
      await channel.subscribe('ping.tick')
      await client.call('emit_ping', { channel: 'room-go', params: { n: 7 } })
      await expect(received).resolves.toEqual({ n: 7 })
      await channel.unsubscribe('ping.tick')
    } finally {
      await client.close()
    }
  })
})
