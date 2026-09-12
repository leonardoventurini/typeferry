import { type ChildProcess, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import WS from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Client } from '../../client'
import { ClientEvents } from '../../utils'

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const RUBY_DIR = path.join(REPO_ROOT, 'typeferry-rb')
const SERVER = path.join(RUBY_DIR, 'exe/typeferry-conformance-server')
const BUNDLE = process.env.TYPEFERRY_RUBY_BUNDLE ?? 'bundle'
const RUBY_AVAILABLE = fs.existsSync(SERVER) && process.env.TYPEFERRY_RUBY_INTEGRATION === '1'
const describeIf = RUBY_AVAILABLE ? describe : describe.skip

function readPort(proc: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for Ruby server port')), 30_000)
    let buffer = ''
    proc.stderr?.on('data', chunk => {
      buffer += chunk.toString('utf8')
      const match = buffer.match(/TYPEFERRY_PORT=(\d+)/)
      if (match) {
        clearTimeout(timer)
        resolve(Number.parseInt(match[1]!, 10))
      }
    })
    proc.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    proc.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`Ruby server exited early with code ${code}`))
    })
  })
}

describeIf('JS client ↔ Ruby server (cross-language integration)', () => {
  let proc: ChildProcess
  let port: number

  beforeAll(async () => {
    ;(globalThis as unknown as { WebSocket: typeof WS }).WebSocket = WS
    proc = spawn(BUNDLE, ['exec', 'ruby', SERVER], {
      cwd: RUBY_DIR,
      env: {...process.env},
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    port = await readPort(proc)
  }, 40_000)

  afterAll(async () => {
    if (proc && !proc.killed) proc.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 300))
  })

  async function newClient(context?: Record<string, unknown>): Promise<Client> {
    return await new Promise<Client>((resolve, reject) => {
      const client = new Client({
        host: '127.0.0.1',
        port,
        ...(context === undefined ? {} : {initialContext: context}),
      })
      client.once(ClientEvents.INITIALIZED, () => resolve(client))
      client.once(ClientEvents.ERROR, reject)
    })
  }

  it('calls HTTP and WebSocket RPC methods', async () => {
    const client = await newClient()
    try {
      expect(await client.call('add', {a: 2, b: 3})).toBe(5)
      expect(await client.call('echo', {nested: {value: 7}})).toEqual({nested: {value: 7}})
    } finally {
      await client.close()
    }
  })

  it('enforces and accepts WebSocket authentication', async () => {
    const anonymous = await newClient()
    try {
      await expect(anonymous.call('whoami')).rejects.toBeDefined()
    } finally {
      await anonymous.close()
    }

    const authenticated = await newClient({token: 'good-token'})
    try {
      expect(await authenticated.call('whoami')).toBe('u1')
    } finally {
      await authenticated.close()
    }
  })

  it('subscribes and receives an emitted event', async () => {
    const client = await newClient()
    try {
      const channel = client.channel('room-rb')!
      const received = new Promise(resolve => channel.once('ping.tick', resolve))
      await channel.subscribe('ping.tick')
      await client.call('emit_ping', {channel: 'room-rb', params: {n: 7}})
      await expect(received).resolves.toEqual({n: 7})
      await channel.unsubscribe('ping.tick')
    } finally {
      await client.close()
    }
  })
})
