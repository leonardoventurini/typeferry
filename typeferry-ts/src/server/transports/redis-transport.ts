import type { RedisClientOptions } from 'redis'
import { createClient } from 'redis'

import {
  NO_CHANNEL,
  Presentation,
  RedisListeners,
  ServerEvents,
} from '../../utils'
import type { Server } from '../server'

export type RedisMessage = {
  event: string
  channel: string
  message: string
  excludeUuid?: string
}

export const RedisKey = {
  CLIENTS: 'typeferry:clients',
}

/**
 * This is mainly used to propagate events to other instances when running node in a cluster.
 */
export class RedisTransport {
  opts: RedisClientOptions
  pub: any
  sub: any

  server: Server

  static defaultRedisOpts: RedisClientOptions = {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  }

  constructor(server: Server, opts: RedisClientOptions | boolean) {
    this.server = server
    this.opts = Object.assign({}, RedisTransport.defaultRedisOpts, opts)

    this.connect().catch(console.error)
  }

  private async connect() {
    this.pub = createClient({
      ...RedisTransport.defaultRedisOpts,
      ...this.opts,
    })
    this.sub = this.pub.duplicate()

    await this.pub.connect()
    await this.sub.connect()

    await this.sub.pSubscribe(RedisListeners.EVENTS, redisMessage => {
      const { event, channel, message, excludeUuid } =
        Presentation.decode<RedisMessage>(redisMessage)

      // Do not add a debugger here, it will cause an infinite loop since it
      // triggers an event this also goes through the transport.

      this.server.channel(channel).propagate(event, message, excludeUuid)
    })

    this.server.emit(ServerEvents.REDIS_CONNECT)
  }

  /**
   * Publishes an event to the Redis channel for cluster-wide propagation.
   * @param excludeUuid - Optional client uuid to exclude from receiving the event
   */
  async publish(
    event: string,
    channel: string = NO_CHANNEL,
    message: string,
    excludeUuid?: string,
  ) {
    if (!this.pub) return

    // Do not add a debugger here, it will cause an infinite loop since it
    // triggers an event this also goes through the transport.

    return this.pub.publish(
      RedisListeners.EVENTS,

      Presentation.encode<RedisMessage>({
        event,
        channel,
        message,
        excludeUuid,
      }),
    )
  }

  async close() {
    if (this.pub) {
      await this.pub.del(`typeferry:clients:${this.server.uuid}`)
      await this.pub.sRem(`typeferry:servers`, this.server.uuid)
    }

    if (this.pub?.isOpen) await this.pub.quit()
    if (this.sub?.isOpen) await this.sub.quit()

    this.pub = undefined
    this.sub = undefined
  }

  public async getStats() {
    let clientCount = 0
    let userCount = 0
    const users = new Set()

    const servers = await this.pub.sMembers(`typeferry:servers`)

    for (const server of servers) {
      clientCount += await this.pub.sCard(`typeferry:clients:${server}`)
      userCount += await this.pub.sCard(`typeferry:users:${server}`)

      const serverUsers = await this.pub.sMembers(`typeferry:users:${server}`)

      serverUsers.forEach(user => users.add(user))
    }

    return {
      clientCount,
      userCount,
      users: Array.from(users),
    }
  }
}
