import { EventEmitter2 } from 'eventemitter2'
import { isEmpty } from 'bifrost/utils/lodash'

import type { AnyFunction } from '../utils'
import { BifrostEvents, createIterator, Methods } from '../utils'
import type { Client } from './client'
import { LogLevel } from './logger'

export class ClientChannel extends EventEmitter2 {
  client: Client
  name: string
  events: Set<string> = new Set()

  // Built-in from EventEmitter2
  _events?: Record<string, AnyFunction[]>

  constructor(name: string) {
    super({
      maxListeners: 512,
    })

    if (typeof name !== 'string' || !name)
      throw new Error('the channel name needs to be a string')

    this.name = name
  }

  setClient(client: Client) {
    this.client = client
  }
  private pendingSubscriptions: Set<string> = new Set()
  private subscribeDebounceTimeout?: NodeJS.Timeout

  /**
   * Commits batched subscription requests via RPC.
   * Emits `{}` (not null) on failure so downstream `result[event]`
   * lookups don't crash with "Cannot read properties of null".
   */
  async commitPendingSubscriptions(): Promise<void> {
    const channel = this.name
    const allEvents = Array.from(this.pendingSubscriptions)
    this.pendingSubscriptions.clear()

    if (!isEmpty(allEvents)) {
      let result: Record<string, boolean> = {}
      try {
        result =
          (await this.client.call(Methods.RPC_ON, {
            events: allEvents,
            channel,
          })) ?? {}
      } catch {
        result = {}
      }
      this.emit(BifrostEvents.COMMIT_PENDING_SUBSCRIPTIONS, result)
    }
  }

  async subscribe(event: string | string[]) {
    const events = Array.isArray(event) ? event : [event]

    if (isEmpty(events)) return {}

    for (const event of events) {
      this.events.add(event)
      this.pendingSubscriptions.add(event)
    }

    if (this.subscribeDebounceTimeout) {
      clearTimeout(this.subscribeDebounceTimeout)
    }

    this.subscribeDebounceTimeout = setTimeout(
      this.commitPendingSubscriptions.bind(this),
      100,
    )

    try {
      // Wait longer (15s) during reconnection when network may be slow
      const [result] = await this.waitFor(
        BifrostEvents.COMMIT_PENDING_SUBSCRIPTIONS,
        15000,
      )

      return result
    } catch (error) {
      this.client.logger.subscription(
        LogLevel.ERROR,
        'Failed to commit subscriptions',
        { channel: this.name, events: Array.from(this.events) },
        error as Error,
      )
      return {}
    }
  }

  private pendingUnsubscriptions: Set<string> = new Set()
  private unsubscribeDebounceTimeout?: NodeJS.Timeout

  async commitPendingUnsubscriptions() {
    const channel = this.name
    const allEvents = Array.from(this.pendingUnsubscriptions)
    this.pendingUnsubscriptions.clear()

    if (!isEmpty(allEvents)) {
      let result = null

      try {
        result = await this.client.call(Methods.RPC_OFF, {
          events: allEvents,
          channel,
        })
      } catch {
        result = {}
      }

      this.emit(BifrostEvents.COMMIT_PENDING_UNSUBSCRIPTIONS, result)
    }
  }

  async unsubscribe(event: string | string[]) {
    const events = Array.isArray(event) ? event : [event]

    if (isEmpty(events)) return {}

    for (const event of events) {
      this.events.delete(event)
      this.pendingUnsubscriptions.add(event)
    }

    if (this.unsubscribeDebounceTimeout) {
      clearTimeout(this.unsubscribeDebounceTimeout)
    }

    this.unsubscribeDebounceTimeout = setTimeout(
      this.commitPendingUnsubscriptions.bind(this),
      100,
    )

    try {
      // Wait longer (15s) during reconnection when network may be slow
      const [result] = await this.waitFor(
        BifrostEvents.COMMIT_PENDING_UNSUBSCRIPTIONS,
        15000,
      )

      return result
    } catch (error) {
      this.client.logger.subscription(
        LogLevel.ERROR,
        'Failed to commit unsubscriptions',
        { channel: this.name, events: Array.from(this.events) },
        error as Error,
      )
      return {}
    }
  }

  async resubscribe() {
    return this.subscribe(Array.from(this.events))
  }

  /**
   * Wait for an event to fire asynchronously.
   *
   * Returns true if no params are sent.
   */
  wait(event: string, callback?: (...data: any) => any): Promise<any | any[]> {
    return new Promise(resolve => {
      this.once(event, function (data = true) {
        if (callback) {
          resolve(callback(data))
        } else {
          resolve(data)
        }
      })
    })
  }

  /**
   * Returns true if the event was not fired within a given timeout.
   */
  timeout(event: string, timeoutMs = 1000) {
    return new Promise(resolve => {
      const timeout = setTimeout(() => resolve(true), timeoutMs)

      this.wait(event).then(res => {
        if (timeout) {
          clearTimeout(timeout)
        }
        resolve(false)
      })
    })
  }

  iterator(event: string) {
    return createIterator(this, event)
  }
}
