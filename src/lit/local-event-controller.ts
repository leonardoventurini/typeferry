import type { ReactiveControllerHost } from 'lit'

import type { AnyFunction } from '../utils'
import { NO_CHANNEL } from '../utils'
import type EventEmitter2 from '../utils/event-emitter'

import {
  type BifrostClientSource,
  type BifrostEventBindingOptions,
  BifrostClientBoundController,
  equalEventBindingOptions,
  normalizeEventBindingOptions,
} from './internal'

export type BifrostLocalEventControllerOptions = {
  event?: string | null
  channel?: string
  active?: boolean
  callback?: AnyFunction | null
}

export class BifrostLocalEventController extends BifrostClientBoundController {
  private currentEmitter: EventEmitter2 | null = null
  private currentEventName: string | null = null
  private currentCallback: AnyFunction | null = null
  private currentActive = true
  private options: BifrostEventBindingOptions

  constructor(
    host: ReactiveControllerHost,
    client: BifrostClientSource,
    options: BifrostLocalEventControllerOptions,
  ) {
    super(host, client)
    this.options = normalizeEventBindingOptions(options)
    this.attach()
  }

  setOptions(options: BifrostLocalEventControllerOptions): void {
    const next = normalizeEventBindingOptions(options)

    if (equalEventBindingOptions(this.options, next)) {
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
    const client = this.bindClient()

    if (this.options.channel === NO_CHANNEL) {
      return client
    }

    return client.channel(this.options.channel) ?? client
  }

  private bindEvent(): void {
    const emitter = this.resolveEmitter()

    if (
      emitter === this.currentEmitter &&
      this.options.event === this.currentEventName &&
      this.options.callback === this.currentCallback &&
      this.options.active === this.currentActive
    ) {
      return
    }

    this.clearCleanups()

    if (!this.options.active) {
      this.currentEmitter = emitter
      this.currentEventName = this.options.event ?? null
      this.currentCallback = this.options.callback ?? null
      this.currentActive = this.options.active
      return
    }

    if (typeof this.options.event !== 'string' || !this.options.event) {
      throw new Error('event name is required')
    }

    const callback = this.options.callback
    this.currentEmitter = emitter
    this.currentEventName = this.options.event
    this.currentCallback = callback
    this.currentActive = this.options.active

    if (typeof callback !== 'function') return

    this.listen(emitter, this.options.event, callback)
  }

  hostDisconnected(): void {
    super.hostDisconnected()
    this.currentEmitter = null
    this.currentEventName = null
    this.currentCallback = null
    this.currentActive = true
  }
}
