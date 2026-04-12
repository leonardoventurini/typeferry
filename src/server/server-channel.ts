import EventEmitter2 from 'eventemitter2'

import { BifrostEvents, ServerEvents } from '../utils'
import type { ClientNode } from './client-node'
import type { EventOptions } from './event'
import { Event } from './event'
import { getRoomName } from './methods'
import type { Server } from './server'
import { HttpTransportEvents, WebSocketTransportEvents } from './transports'

const SystemEvents: string[] = [
  ...Object.values(HttpTransportEvents),
  ...Object.values(ServerEvents),
  ...Object.values(WebSocketTransportEvents),
]

export class ServerChannel extends EventEmitter2 {
  channelName: string
  server: Server

  constructor(channelName: string) {
    super({
      maxListeners: 1024,
    })

    this.channelName = channelName

    this.onAny((event, value) => {
      if (
        !this.server.events.has(event as string) &&
        !SystemEvents.includes(event as string)
      ) {
        console.warn('Event Not Registered:', event)
      }

      if (this.server.events.has(event as string)) {
        const eventObject = this.server.events.get(event as string)

        eventObject.handler(this, value)
      }
    })
  }

  setServer(server: Server) {
    this.server = server
  }

  /**
   * Broadcasts a pre-encoded event payload to all subscribed clients.
   * The payload already contains the wire protocol `t` field (set by
   * Event.handler), so no re-encoding is needed.
   * @param excludeUuid - Optional client uuid to exclude from receiving the event
   */
  propagate(event: string, payload: string, excludeUuid?: string): void {
    const eventObject = this.server.events.get(event)

    if (!eventObject) {
      console.log('Event Not Registered:', event)
      return
    }

    const transport = this.server.webSocketTransport
    if (!transport) {
      console.warn('[Bifrost] WebSocket transport not available for propagate')
      return
    }

    const roomName = getRoomName(this.channelName, event)

    if (excludeUuid) {
      const excludeClient = this.server.allClients.get(excludeUuid)
      transport.rooms.broadcast(roomName, payload, excludeClient?.socket)
    } else {
      transport.rooms.broadcast(roomName, payload)
    }
  }

  defer<T = any>(event: string, params?: T) {
    process.nextTick(() => {
      this.emit(event, params)
    })
  }

  /** Refreshes a method by its identifier. */
  refresh(method: string) {
    this.emit(BifrostEvents.METHOD_REFRESH, method)
  }

  /** Declares a new event. */
  addEvent(name: string, opts?: EventOptions) {
    if (this.server.events.has(name)) {
      this.server.events.delete(name)
    }

    const event = new Event(name, this.server, this, opts)

    this.server.events.set(name, event)
  }

  get list() {
    return Array.from(this.server.events.keys())
  }

  get length() {
    return this.server.events.size
  }

  get(event: string) {
    return this.server.events.get(event)
  }

  has(event: string) {
    return this.server.events.has(event)
  }

  delete(event: string) {
    return this.server.events.delete(event)
  }

  /**
   * Checks if a client is subscribed to an event via the RoomRegistry.
   */
  isSubscribed(client: ClientNode, event: Event): boolean {
    if (!client.socket) return false

    const rooms = this.server.webSocketTransport?.rooms
    if (!rooms) return false

    const roomName = getRoomName(this.channelName, event.name)
    return rooms.has(client.socket, roomName)
  }
}
