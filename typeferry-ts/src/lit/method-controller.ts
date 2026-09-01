import isEqual from 'fast-deep-equal'
import type { ReactiveControllerHost } from 'lit'

import type { Client, ClientChannel } from '../client'
import { TypeFerryEvents, ClientEvents, NO_CHANNEL } from '../utils'
import type EventEmitter2 from '../utils/event-emitter'

import {
  type TypeFerryClientSource,
  TypeFerryClientBoundController,
} from './internal'
import {
  createCaller,
  evaluateMethodCallGate,
  normalizeMethodControllerOptions,
  type TypeFerryMethodControllerOptions,
  type NormalizedMethodControllerOptions,
} from './method-utils'

const LOADING_DELAY_MS = 100
const REMOTE_UNSUBSCRIBE_DELAY_MS = 1000

type RebindKey = {
  client: Client | null
  channel: string
  event: string | null
  cache: boolean
  maxAge: number
}

export class TypeFerryMethodController extends TypeFerryClientBoundController {
  private currentBindKey: RebindKey | null = null
  private options: NormalizedMethodControllerOptions
  private caller: ReturnType<typeof createCaller> | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private loadingTimer: ReturnType<typeof setTimeout> | null = null
  private remoteUnsubscribeTimer: ReturnType<typeof setTimeout> | null = null
  private pendingRefreshQueue: Array<{
    resolve: () => void
    reject: (error: unknown) => void
  }> = []

  private _error: unknown = null
  private _result: unknown = null
  private _loading = false
  private _shouldCall = true
  private _placeholderValue: unknown = void 0

  private readonly handleInitializing = (): void => {
    if (this.options.authenticated) {
      this.setLoading(true)
    }
  }

  private readonly handleInitialized = (): void => {
    if (this.options.authenticated) {
      void this.refresh()
    }
  }

  private readonly handleLogout = (): void => {
    if (this.options.authenticated) {
      void this.refresh()
    }
  }

  private readonly handleLocalEvent = (): void => {
    void this.refresh()
  }

  private readonly handleRemoteMethodRefresh = (refreshMethod: string): void => {
    if (refreshMethod === this.options.method) {
      void this.refresh()
    }
  }

  constructor(
    host: ReactiveControllerHost,
    client: TypeFerryClientSource,
    options: TypeFerryMethodControllerOptions,
  ) {
    super(host, client)
    this.options = normalizeMethodControllerOptions(options)
    this.syncDerivedState()
    this.attach()
  }

  get error(): unknown {
    return this._error
  }

  get loading(): boolean {
    return this._loading
  }

  get result(): unknown {
    if (!this._shouldCall) {
      return this._placeholderValue ?? this.options.defaultValue
    }

    return this._result ?? this.options.defaultValue
  }

  get shouldCall(): boolean {
    return this._shouldCall
  }

  get placeholderValue(): unknown {
    return this._placeholderValue
  }

  setOptions(options: TypeFerryMethodControllerOptions): void {
    const next = normalizeMethodControllerOptions({
      ...this.options,
      ...options,
    })

    if (isEqual(this.options, next)) {
      return
    }

    const nextBindKey = this.createBindKey(next)
    const bindKeyChanged = !this.currentBindKey || !isEqual(this.currentBindKey, nextBindKey)

    this.options = next
    this.syncDerivedState()

    if (bindKeyChanged) {
      this.rebindSubscriptions(nextBindKey)
    }

    if (this._shouldCall && !this.options.lazy) {
      void this.refresh()
    }

    this.requestUpdate()
  }

  optimistic(callback: (result: unknown) => unknown): void {
    if (typeof callback !== 'function') {
      throw new Error('Function Expected')
    }

    this._result = callback(this.result)
    this.requestUpdate()
  }

  async refresh(callback?: () => void): Promise<void> {
    if (!this._shouldCall || !this.options.method || !this.caller) {
      callback?.()
      return
    }

    const delay = this.options.debounced ?? 0

    if (delay > 0) {
      return new Promise<void>((resolve, reject) => {
        this.pendingRefreshQueue.push({ resolve, reject })
        this.clearRefreshTimer()
        this.refreshTimer = setTimeout(() => {
          this.refreshTimer = null
          void this.runRefresh(callback)
            .then(() => this.flushRefreshQueue())
            .catch(error => this.flushRefreshQueue(error))
        }, delay)
      })
    }

    await this.runRefresh(callback)
  }

  hostConnected(): void {
    this.rebindSubscriptions()

    if (this._shouldCall && !this.options.lazy) {
      void this.refresh()
    }
  }

  hostUpdate(): void {
    this.rebindSubscriptions()
  }

  hostDisconnected(): void {
    this.clearRefreshTimer()
    this.clearLoadingTimer()
    this.clearRemoteUnsubscribeTimer()
    this.flushRefreshQueue()
    super.hostDisconnected()

    this.currentBindKey = null
    this.caller = null
    this._error = null
    this._result = null
    this._loading = !this.options.lazy && this._shouldCall
  }

  private createBindKey(
    options: NormalizedMethodControllerOptions = this.options,
  ): RebindKey {
    return {
      client: this.currentClient,
      channel: options.channel,
      event: options.event,
      cache: options.cache,
      maxAge: options.maxAge,
    }
  }

  private syncDerivedState(): void {
    const gate = evaluateMethodCallGate({
      parse: this.options.parse,
      params: this.options.params,
      required: this.options.required,
    })

    this._shouldCall = gate.shouldCall
    this._placeholderValue = gate.placeholderValue

    if (!this._shouldCall) {
      this.clearLoadingTimer()
      this.setLoading(false)
    } else if (!this.options.lazy && !this._loading) {
      this.setLoading(true)
    }
  }

  private setLoading(value: boolean): void {
    if (this._loading === value) return

    this._loading = value
    this.requestUpdate()
  }

  private setError(value: unknown): void {
    if (this._error === value) return

    this._error = value
    this.requestUpdate()
  }

  private setResult(value: unknown): void {
    if (this._result === value) return

    this._result = value
    this.requestUpdate()
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  private clearLoadingTimer(): void {
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer)
      this.loadingTimer = null
    }
  }

  private clearRemoteUnsubscribeTimer(): void {
    if (this.remoteUnsubscribeTimer) {
      clearTimeout(this.remoteUnsubscribeTimer)
      this.remoteUnsubscribeTimer = null
    }
  }

  private flushRefreshQueue(error?: unknown): void {
    while (this.pendingRefreshQueue.length) {
      const deferred = this.pendingRefreshQueue.shift()

      if (!deferred) continue

      if (error) {
        deferred.reject(error)
      } else {
        deferred.resolve()
      }
    }
  }

  private rebindSubscriptions(nextBindKey?: RebindKey): void {
    if (typeof this.options.method !== 'string' || !this.options.method) {
      throw new Error('Method name is required.')
    }

    const client = this.bindClient()
    const bindKey = nextBindKey ?? this.createBindKey()

    if (this.currentBindKey && isEqual(this.currentBindKey, bindKey)) {
      return
    }

    this.caller = createCaller(client, bindKey.cache, bindKey.maxAge)
    this.clearRemoteUnsubscribeTimer()
    this.clearCleanups()

    this.currentBindKey = bindKey

    this.listen(client, ClientEvents.INITIALIZING, this.handleInitializing)
    this.listen(client, ClientEvents.INITIALIZED, this.handleInitialized)
    this.listen(client, ClientEvents.LOGOUT, this.handleLogout)

    const emitter =
      this.options.channel === NO_CHANNEL
        ? client
        : (client.channel(this.options.channel) as ClientChannel | null)

    if (!emitter) {
      throw new Error('channel name is required')
    }

    const channel =
      emitter === client
        ? (client.channel() as ClientChannel | null)
        : (emitter as ClientChannel)

    if (typeof this.options.event === 'string' && this.options.event) {
      this.listen(emitter, this.options.event, this.handleLocalEvent)
    }

    if (!channel) return

    channel.on(TypeFerryEvents.METHOD_REFRESH, this.handleRemoteMethodRefresh)
    this.addCleanup(() => {
      channel.off(TypeFerryEvents.METHOD_REFRESH, this.handleRemoteMethodRefresh)
      this.clearRemoteUnsubscribeTimer()
      this.remoteUnsubscribeTimer = setTimeout(() => {
        const listeners = channel._events?.[TypeFerryEvents.METHOD_REFRESH]
        const hasListeners = Array.isArray(listeners)
          ? listeners.length > 0
          : !!listeners

        if (!hasListeners) {
          channel.unsubscribe(TypeFerryEvents.METHOD_REFRESH).catch(console.error)
        }
      }, REMOTE_UNSUBSCRIBE_DELAY_MS)
    })

    channel.subscribe(TypeFerryEvents.METHOD_REFRESH).catch(console.error)
  }

  private async runRefresh(callback?: () => void): Promise<void> {
    if (!this._shouldCall || !this.options.method || !this.caller) {
      callback?.()
      return
    }

    if (this.options.authenticated && !this.currentClient?.authenticated) {
      this.setError(null)
      this.setResult(this.options.defaultValue)
      this.clearLoadingTimer()
      this.setLoading(false)
      callback?.()
      return
    }

    this.clearLoadingTimer()
    this.loadingTimer = setTimeout(() => {
      this.setLoading(true)
    }, LOADING_DELAY_MS)

    try {
      const result = await this.caller(this.options.method, this.options.params, {
        http: this.options.http,
        timeout: this.options.timeout,
        httpFallback: this.options.httpFallback,
        ignoreInit: this.options.ignoreInit,
        maxRetries: this.options.maxRetries,
        delayBetweenRetriesMs: this.options.delayBetweenRetriesMs,
      })

      this.setResult(result)
      this.setError(null)
    } catch (error) {
      console.error(error)
      this.setError(error)
      this.setResult(undefined)
    } finally {
      this.clearLoadingTimer()
      this.setLoading(false)
      callback?.()
    }
  }
}
