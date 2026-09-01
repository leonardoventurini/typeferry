/**
 * Browser-safe event emitter used across TypeFerry runtime paths.
 *
 * This replaces `eventemitter2` in source-first builds so consumers do not
 * depend on CommonJS interop at runtime, while keeping the listener cleanup
 * semantics TypeFerry relies on to avoid subscription leaks.
 */
export type EventListener = (...args: any[]) => void

type AnyEventListener = (event: string, ...args: any[]) => void

type EventEntry = EventListener | EventListener[]

type EventEmitterOptions = {
  maxListeners?: number
}

type OnceListener = EventListener & {
  originalListener?: EventListener
}

export default class EventEmitter2 {
  _events?: Record<string, EventEntry | undefined> = {}
  private anyListeners = new Set<AnyEventListener>()
  private maxListeners = Number.POSITIVE_INFINITY

  constructor(options: EventEmitterOptions = {}) {
    this.maxListeners = options.maxListeners ?? Number.POSITIVE_INFINITY
  }

  on(event: string, listener: EventListener): this {
    this.setListeners(event, [...this.listeners(event), listener])
    this.warnMaxListeners(event)
    return this
  }

  off(event: string, listener: EventListener): this {
    const listeners = this.listeners(event).filter(
      current => !this.matchesListener(current, listener),
    )
    this.setListeners(event, listeners)
    return this
  }

  once(event: string, listener: EventListener): this {
    const wrapped: OnceListener = (...args: unknown[]) => {
      this.off(event, wrapped)
      listener(...args)
    }
    wrapped.originalListener = listener
    return this.on(event, wrapped)
  }

  emit(event: string, ...args: any[]): boolean {
    const listeners = this.listeners(event)
    const anyListeners = [...this.anyListeners]
    listeners.forEach(listener => listener(...args))
    anyListeners.forEach(listener => listener(event, ...args))
    return listeners.length > 0 || anyListeners.length > 0
  }

  onAny(listener: AnyEventListener): this {
    this.anyListeners.add(listener)
    return this
  }

  offAny(listener: AnyEventListener): this {
    this.anyListeners.delete(listener)
    return this
  }

  removeAllListeners(event?: string): this {
    if (event) delete this._events[event]
    else this.reset()
    return this
  }

  listenerCount(event: string): number {
    return this.listeners(event).length
  }

  setMaxListeners(maxListeners: number): this {
    this.maxListeners = maxListeners
    return this
  }

  waitFor(event: string, timeout?: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const listener = (...args: any[]) => {
        this.clearTimer(timer)
        resolve(args)
      }
      const timer = this.createTimer(timeout, event, listener, reject)
      this.once(event, listener)
    })
  }

  private listeners(event: string): EventListener[] {
    const entry = this._events?.[event]
    if (!entry) return []
    return Array.isArray(entry) ? [...entry] : [entry]
  }

  private setListeners(event: string, listeners: EventListener[]): void {
    if (listeners.length === 0) {
      delete this._events[event]
      return
    }
    this._events[event] = listeners.length === 1 ? listeners[0] : listeners
  }

  private matchesListener(current: EventListener, target: EventListener): boolean {
    const onceListener = current as OnceListener
    return current === target || onceListener.originalListener === target
  }

  private warnMaxListeners(event: string): void {
    if (this.listenerCount(event) <= this.maxListeners) return
    console.warn(`[TypeFerry] Listener count exceeded for "${event}"`)
  }

  private createTimer(
    timeout: number | undefined,
    event: string,
    listener: EventListener,
    reject: (error: Error) => void,
  ): ReturnType<typeof setTimeout> | null {
    if (!timeout || timeout <= 0) return null
    return setTimeout(() => {
      this.off(event, listener)
      reject(new Error(`Timed out waiting for "${event}"`))
    }, timeout)
  }

  private clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
    if (timer) clearTimeout(timer)
  }

  private reset(): void {
    this._events = {}
    this.anyListeners.clear()
  }
}
