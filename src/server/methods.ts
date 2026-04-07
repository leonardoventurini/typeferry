import type { z } from 'zod'

import { isEmpty } from '@example-app/bifrost/utils/lodash'

import { NO_CHANNEL, ServerEvents } from '../utils'
import { Method } from './method'
import { Server } from './server'

/**
 * Generates a room name for a channel/event subscription.
 * Format: `bifrost:${channel}:${event}`
 */
export function getRoomName(channel: string, eventName: string): string {
  return `bifrost:${channel}:${eventName}`
}

export const rpcOff = (
  server: Server,
  method: string,
): Method<z.ZodType, unknown> =>
  new Method(
    server,
    method,
    function ({ events, channel = NO_CHANNEL }) {
      if (!this.socket) return {}

      const rooms = server.webSocketTransport?.rooms
      if (!rooms) return {}

      return events.reduce(
        (acc: Record<string, boolean>, eventName: string) => {
          const event = server.events.get(eventName)

          if (!event) {
            console.log('[Bifrost] Event Not Found:', eventName)
            return { ...acc, [eventName]: false }
          }

          const roomName = getRoomName(channel, eventName)
          rooms.leave(this.socket, roomName)

          return { ...acc, [eventName]: true }
        },
        {},
      )
    },
    { protected: false },
  )

/**
 * Checks if a client can subscribe to an event and joins the room.
 */
async function canSubscribeToEvent(
  server: Server,
  client: any,
  eventName: string,
  channel: string,
): Promise<boolean> {
  const event = server.events.get(eventName)

  if (!event) {
    console.log('[Bifrost] Event Not Found:', eventName)
    return false
  }

  const eventAllowed = !event.isProtected || client.authenticated
  if (!eventAllowed) return false

  const subscribeAllowed = await event.shouldSubscribe(
    client,
    eventName,
    channel,
  )
  if (!subscribeAllowed) return false

  if (!client.socket) return false

  const rooms = server.webSocketTransport?.rooms
  if (!rooms) return false

  const roomName = getRoomName(channel, eventName)
  rooms.join(client.socket, roomName)

  return true
}

export const rpcOn = (
  server: Server,
  method: string,
): Method<z.ZodType, unknown> =>
  new Method(
    server,
    method,
    async function ({ events, channel = NO_CHANNEL }) {
      if (isEmpty(events)) return {}

      const channelAllowed = await server.shouldAllowChannelSubscribe(
        this,
        channel,
      )

      const acc: Record<string, boolean> = {}

      for (const eventName of events) {
        if (!channelAllowed) {
          acc[eventName] = false
          continue
        }

        acc[eventName] = await canSubscribeToEvent(
          server,
          this,
          eventName,
          channel,
        )
      }

      return acc
    },
    { protected: false },
  )

export const rpcLogout = (
  server: Server,
  method: string,
): Method<z.ZodType, unknown> =>
  new Method(
    server,
    method,
    async function () {
      this.context = null
      this.authenticated = false
      this.userId = null
      server.emit(ServerEvents.LOGOUT, this)
      return true
    },
    { protected: true },
  )
