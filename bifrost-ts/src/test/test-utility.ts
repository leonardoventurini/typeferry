import { afterEach, beforeEach } from 'vitest'

import type { ClientOptions } from '../client'
import { Client } from '../client'
import type { EventOptions, ServerOptions } from '../server'
import { Server } from '../server'
import { ClientEvents, NO_CHANNEL, ServerEvents, sleep } from '../utils'

export interface TestClientOptions extends ClientOptions {
  context?: Record<string, any>
}

export class TestUtility {
  server: Server
  client: Client
  host = '127.0.0.1'

  clients: Client[] = []
  servers: Server[] = []

  // Track original global state for restoration
  private originalGlobalBifrost: Server | undefined
  private createdGlobalInstance = false

  constructor({
    debug = false,
    globalInstance = false,
    redis = undefined,
  } = {}) {
    beforeEach(async () => {
      // Save original global state before test
      this.originalGlobalBifrost = global.Bifrost
      this.createdGlobalInstance = globalInstance

      this.server = await this.createSrv({
        debug,
        globalInstance,
        origins: ['http://localhost'],
        redis,
      })

      this.client = await this.createClient({
        debug,
      })
    })

    afterEach(async () => {
      // Close all clients (now properly cleans up event listeners)
      await Promise.all(this.clients.map(client => client.close()))

      // Close all servers
      await Promise.all(this.servers.map(server => server.close()))

      this.clients = []
      this.servers = []

      // Clear localStorage to prevent context leaking between tests
      if (typeof localStorage !== 'undefined') {
        localStorage.clear()
      }

      // Restore original global Bifrost if we modified it
      if (this.createdGlobalInstance && this.originalGlobalBifrost) {
        global.Bifrost = this.originalGlobalBifrost
      }

      await sleep(100)
    })
  }

  get port() {
    return this.server?.port
  }

  get address() {
    return `${this.host}:${this.port}`
  }

  async createSrv(opts?: ServerOptions) {
    return new Promise<Server>((resolve, reject) => {
      const server = new Server({
        host: this.host,
        port: opts?.port ?? 0,
        rateLimit: true,
        globalInstance: false,
        ...opts,
      })

      server.once(ServerEvents.READY, () => {
        this.servers.push(server)
        resolve(server)
      })

      server.once(Server.ERROR_EVENT, error => reject(error))
    })
  }

  async createRandomSrv(opts?: ServerOptions) {
    return this.createSrv({
      port: 0,
      ...opts,
    })
  }

  async createClient(opts?: TestClientOptions) {
    return new Promise<Client>((resolve, reject) => {
      const port = opts?.port ?? this.port
      const { context, ...clientOpts } = opts ?? {}

      const client = new Client({
        host: clientOpts?.host ?? this.host,
        port,
        ...clientOpts,
        /**
         * Pass initial context so the Client constructor has the auth token
         * available before creating the WebSocket connection. With native
         * WebSocket, auth data is sent as query parameters during the initial
         * connection — unlike Socket.IO's lazy auth callback, the token must
         * be available at socket creation time.
         */
        initialContext: context,
      })

      client.once(ClientEvents.INITIALIZED, () => {
        this.clients.push(client)
        resolve(client)
      })

      client.once(ClientEvents.ERROR, error => reject(error))

      if (this.server.port === port) {
        this.server.once(ServerEvents.CLOSED, () => {
          client.close()
        })
      }
    })
  }

  async createAuthenticatedClient(opts?: TestClientOptions) {
    return this.createClient({
      context: { token: 'test' },
      ...opts,
    })
  }

  async createEvent(
    event: string,
    channel: string = NO_CHANNEL,
    opts?: EventOptions,
  ) {
    this.server.addEvent(event, opts)
    await this.client.channel(channel)?.subscribe(event)
  }

  async catchError(callback: Promise<any> | (() => Promise<any>)) {
    try {
      await (callback instanceof Promise ? callback : callback)
      return null
    } catch (e) {
      return e
    }
  }

  async sleep(timeout = 1000) {
    return new Promise<void>(resolve => {
      setTimeout(() => resolve(), timeout)
    })
  }
}
