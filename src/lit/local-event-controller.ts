import type { EventEmitter2 } from 'eventemitter2'
import type { ReactiveControllerHost } from 'lit'

import type { AnyFunction } from '../utils'
import { NO_CHANNEL } from '../utils'

import {
  type BifrostClientSource,
  BifrostReactiveController,
  requireClient,
} from './internal'

export type BifrostLocalEventControllerOptions = {
  event?: string | null
  channel?: string
  active?: boolean
  callback?: AnyFunction | null
}

export class BifrostLocalEventController extends BifrostReactiveController {
  private clientSource: BifrostClientSource
  private currentClient: EventEmitter2 | null = null
  private currentEventName: string | null = null
  private currentCallback: AnyFunction | null = null
  private currentActive = true
  private options: Required<
    Pick<BifrostLocalEventControllerOptions, 'channel' | 'active'>
  > &
    Pick<BifrostLocalEventControllerOptions, 'event' | 'callback'>

  constructor(
    host: ReactiveControllerHost,
    client: BifrostClientSource,
    options: BifrostLocalEventControllerOptions,
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

  setOptions(options: BifrostLocalEventControllerOptions): void {
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
    this.bindEvent()
  }

  hostConnected(): void {
    this.bindEvent()
  }

  hostUpdate(): void {
    this.bindEvent()
  }

  private resolveEmitter(): EventEmitter2 {
    const client = requireClient(this.clientSource)

    if (this.options.channel === NO_CHANNEL) {
      return client
    }

    return client.channel(this.options.channel) ?? client
  }

  private bindEvent(): void {
    const emitter = this.resolveEmitter()

    if (
      emitter === this.currentClient &&
      this.options.event === this.currentEventName &&
      this.options.callback === this.currentCallback &&
      this.options.active === this.currentActive
    ) {
      return
    }

    this.clearCleanups()

    if (!this.options.active) {
      this.currentClient = emitter
      this.currentEventName = this.options.event ?? null
      this.currentCallback = this.options.callback ?? null
      this.currentActive = this.options.active
      return
    }

    if (typeof this.options.event !== 'string' || !this.options.event) {
      throw new Error('event name is required')
    }

    const callback = this.options.callback
    this.currentClient = emitter
    this.currentEventName = this.options.event
    this.currentCallback = callback
    this.currentActive = this.options.active

    if (typeof callback !== 'function') return

    this.listen(emitter, this.options.event, callback)
  }

  hostDisconnected(): void {
    super.hostDisconnected()
    this.currentClient = null
    this.currentEventName = null
    this.currentCallback = null
    this.currentActive = true
  }
}
