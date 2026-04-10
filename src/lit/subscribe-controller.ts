import type { EventEmitter2 } from 'eventemitter2'
import type { ReactiveControllerHost } from 'lit'

import type { ClientChannel } from '../client'
import type { AnyFunction } from '../utils'
import { NO_CHANNEL } from '../utils'

import {
  type BifrostClientSource,
  BifrostReactiveController,
  requireClient,
} from './internal'

export type BifrostSubscribeControllerOptions = {
  event?: string | null
  channel?: string
  active?: boolean
  callback?: AnyFunction | null
}

const UNSUBSCRIBE_DELAY_MS = 1000

export class BifrostSubscribeController extends BifrostReactiveController {
  private clientSource: BifrostClientSource
  private currentClient: EventEmitter2 & {
    channel(name: string): ClientChannel | null
  } | null = null
  private currentEventName: string | null = null
  private currentChannelName: string | null = null
  private currentCallback: AnyFunction | null = null
  private currentActive = true

  private options: Required<Pick<BifrostSubscribeControllerOptions, 'channel' | 'active'>> &
    Pick<BifrostSubscribeControllerOptions, 'event' | 'callback'>

  private currentChannel: ClientChannel | null = null
  private unsubscribeTimer: ReturnType<typeof setTimeout> | null = null
  ready = false

  constructor(
    host: ReactiveControllerHost,
    client: BifrostClientSource,
    options: BifrostSubscribeControllerOptions,
  ) {
    super(host)
    this.clientSource = client
    this.options = {
      event: options.event ?? null,
      channel: options.channel ?? NO_CHANNEL,
      active: options.active ?? true,
      callback: options.callback ?? null,
    }
    this.attach()
  }

  setOptions(options: BifrostSubscribeControllerOptions): void {
    const next = {
      event: options.event ?? null,
      channel: options.channel ?? NO_CHANNEL,
      active: options.active ?? true,
      callback: options.callback ?? null,
    }

    if (
      this.options.event === next.event &&
      this.options.channel === next.channel &&
      this.options.active === next.active &&
      this.options.callback === next.callback
    ) {
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

  private resolveClient(): EventEmitter2 & {
    channel(name: string): ClientChannel | null
  } {
    return requireClient(this.clientSource) as EventEmitter2 & {
      channel(name: string): ClientChannel | null
    }
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

    const client = this.resolveClient()

    if (
      client === this.currentClient &&
      eventName === this.currentEventName &&
      channelName === this.currentChannelName &&
      callback === this.currentCallback &&
      this.options.active === this.currentActive
    ) {
      return
    }

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

    this.currentChannel = channel
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
    this.currentClient = null
    this.currentEventName = null
    this.currentChannelName = null
    this.currentCallback = null
    this.currentActive = true
    this.currentChannel = null
    this.ready = false
  }
}
