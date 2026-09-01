import type { ReactiveControllerHost } from 'lit'

import type { ClientChannel } from '../client'
import type { AnyFunction } from '../utils'
import { NO_CHANNEL } from '../utils'
import type EventEmitter2 from '../utils/event-emitter'

import {
  type TypeFerryClientSource,
  type TypeFerryEventBindingOptions,
  TypeFerryClientBoundController,
  equalEventBindingOptions,
  normalizeEventBindingOptions,
} from './internal'

export type TypeFerrySubscribeControllerOptions = {
  event?: string | null
  channel?: string
  active?: boolean
  callback?: AnyFunction | null
}

const UNSUBSCRIBE_DELAY_MS = 1000

type TypeFerrySubscribeClient = EventEmitter2 & {
  channel(name: string): ClientChannel | null
}

export class TypeFerrySubscribeController extends TypeFerryClientBoundController<TypeFerrySubscribeClient> {
  private currentEventName: string | null = null
  private currentChannelName: string | null = null
  private currentCallback: AnyFunction | null = null
  private currentActive = true

  private options: TypeFerryEventBindingOptions
  private unsubscribeTimer: ReturnType<typeof setTimeout> | null = null
  ready = false

  constructor(
    host: ReactiveControllerHost,
    client: TypeFerryClientSource,
    options: TypeFerrySubscribeControllerOptions,
  ) {
    super(host, client)
    this.options = normalizeEventBindingOptions(options)
    this.attach()
  }

  setOptions(options: TypeFerrySubscribeControllerOptions): void {
    const next = normalizeEventBindingOptions(options)

    if (equalEventBindingOptions(this.options, next)) {
      return
    }

    this.options = next
    this.bindSubscription()
  }

  hostConnected(): void {
    this.bindSubscription()
  }

  hostUpdate(): void {
    this.bindSubscription()
  }

  private clearPendingUnsubscribe(): void {
    if (this.unsubscribeTimer) {
      clearTimeout(this.unsubscribeTimer)
      this.unsubscribeTimer = null
    }
  }

  private scheduleUnsubscribe(
    channel: ClientChannel,
    event: string,
    callback: AnyFunction | null,
  ): void {
    this.clearPendingUnsubscribe()

    if (callback) {
      channel.off(event, callback)
    }

    this.unsubscribeTimer = setTimeout(() => {
      const listeners = channel._events?.[event]
      const hasListeners = Array.isArray(listeners)
        ? listeners.length > 0
        : !!listeners

      if (!hasListeners) {
        channel.unsubscribe(event).catch(console.error)
      }
    }, UNSUBSCRIBE_DELAY_MS)
  }

  private bindSubscription(): void {
    const eventName = this.options.event ?? null
    const channelName = this.options.channel ?? NO_CHANNEL
    const callback = this.options.callback ?? null

    const nextClient = this.resolveClient()

    if (
      nextClient === this.currentClient &&
      eventName === this.currentEventName &&
      channelName === this.currentChannelName &&
      callback === this.currentCallback &&
      this.options.active === this.currentActive
    ) {
      return
    }

    const client =
      nextClient === this.currentClient ? nextClient : this.bindClient()

    this.clearPendingUnsubscribe()
    this.clearCleanups()

    if (!this.options.active) {
      this.currentClient = client
      this.currentEventName = eventName
      this.currentChannelName = channelName
      this.currentCallback = callback
      this.currentActive = this.options.active
      if (this.ready) {
        this.ready = false
        this.requestUpdate()
      }
      return
    }

    if (typeof this.options.event !== 'string' || !this.options.event) {
      throw new Error('event name is required')
    }

    if (typeof this.options.channel !== 'string') {
      throw new Error('channel name is required')
    }

    const channel = client.channel(this.options.channel)

    if (!channel) {
      throw new Error('channel name is required')
    }

    this.currentClient = client
    this.currentEventName = eventName
    this.currentChannelName = channelName
    this.currentCallback = callback
    this.currentActive = this.options.active
    if (this.ready) {
      this.ready = false
      this.requestUpdate()
    }

    if (typeof callback === 'function') {
      channel.on(eventName, callback)
      this.addCleanup(() =>
        this.scheduleUnsubscribe(channel, eventName, callback),
      )
    } else {
      this.addCleanup(() => this.scheduleUnsubscribe(channel, eventName, null))
    }

    channel
      .subscribe(eventName)
      .then(result => {
        const nextReady = !!result?.[eventName]

        if (nextReady === this.ready) return

        this.ready = nextReady
        this.requestUpdate()
      })
      .catch(console.error)
  }

  hostDisconnected(): void {
    this.clearPendingUnsubscribe()
    super.hostDisconnected()
    this.currentEventName = null
    this.currentChannelName = null
    this.currentCallback = null
    this.currentActive = true
    this.ready = false
  }
}
