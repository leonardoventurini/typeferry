import type { RedisClientOptions } from 'redis'
import { createClient } from 'redis'
import { afterAll, beforeAll } from 'vitest'

export class RedisTestUtility {
  pub: ReturnType<typeof createClient> | undefined
  sub: ReturnType<typeof createClient> | undefined

  constructor(options?: RedisClientOptions) {
    this.connect(options).catch(console.error)
  }

  async connect(options?: RedisClientOptions): Promise<void> {
    const defaultOptions: RedisClientOptions = {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    }

    beforeAll(async () => {
      this.pub = createClient({ ...defaultOptions, ...options })
      this.sub = createClient({ ...defaultOptions, ...options })

      await this.pub.connect()
      await this.sub.connect()
    })

    // Need to quit otherwise it hangs the server.
    afterAll(async () => {
      await this.pub?.quit()
      await this.sub?.quit()

      this.pub = undefined
      this.sub = undefined
    })
  }

  /**
   * Subscribes to a channel and returns a promise that resolves with the first
   * message. The subscription is guaranteed to be active before the returned
   * `ready` promise resolves, preventing pub/sub race conditions across
   * separate Redis connections.
   */
  subscribe(channel: string): {
    ready: Promise<void>
    message: Promise<{ channel: string; message: string }>
  } {
    if (!this.sub) throw new Error('Redis subscriber not connected')

    type PubSubResult = { channel: string; message: string }
    // Assigned synchronously by Promise executor below
    let resolveMessage: (v: PubSubResult) => void = () => undefined
    const message = new Promise<PubSubResult>(resolve => {
      resolveMessage = resolve
    })

    const ready = this.sub.pSubscribe(channel, (msg: string) => {
      resolveMessage({ channel, message: msg })
    })

    return { ready, message }
  }
}
