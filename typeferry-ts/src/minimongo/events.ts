type EventMap = Record<string, readonly unknown[]>

type EventName<TEvents extends EventMap> = Extract<keyof TEvents, string>

type EventListener<TArguments extends readonly unknown[]> = (...args: TArguments) => void

type AnyEventListener<TEvents extends EventMap> = <TEvent extends EventName<TEvents>>(
  event: TEvent,
  ...args: TEvents[TEvent]
) => void

interface OnceListener<TArguments extends readonly unknown[]> {
  readonly listener: EventListener<TArguments>
  original: EventListener<TArguments>
}

/** Small typed emitter matching TypeFerry's on/off/once/onAny conventions. */
export class TypedEventEmitter<TEvents extends EventMap> {
  private readonly listeners = new Map<EventName<TEvents>, Set<EventListener<readonly unknown[]>>>()
  private readonly anyListeners = new Set<AnyEventListener<TEvents>>()

  on<TEvent extends EventName<TEvents>>(
    event: TEvent,
    listener: EventListener<TEvents[TEvent]>,
  ): this {
    const listeners = this.listeners.get(event) ?? new Set()
    const alreadyRegistered = listeners.has(listener as EventListener<readonly unknown[]>)

    listeners.add(listener as EventListener<readonly unknown[]>)
    this.listeners.set(event, listeners)
    if (!alreadyRegistered) this.onListenerAdded()

    return this
  }

  off<TEvent extends EventName<TEvents>>(
    event: TEvent,
    listener: EventListener<TEvents[TEvent]>,
  ): this {
    const listeners = this.listeners.get(event)

    if (!listeners) return this

    for (const current of listeners) {
      const once = current as EventListener<readonly unknown[]> & Partial<OnceListener<readonly unknown[]>>

      if (current === listener || once.original === listener) {
        listeners.delete(current)
        this.onListenerRemoved()
      }
    }
    if (listeners.size === 0) this.listeners.delete(event)

    return this
  }

  once<TEvent extends EventName<TEvents>>(
    event: TEvent,
    listener: EventListener<TEvents[TEvent]>,
  ): this {
    const wrapped = ((...args: TEvents[TEvent]) => {
      this.off(event, wrapped)
      listener(...args)
    }) as EventListener<TEvents[TEvent]> & Partial<OnceListener<TEvents[TEvent]>>

    wrapped.original = listener

    return this.on(event, wrapped)
  }

  onAny(listener: AnyEventListener<TEvents>): this {
    this.anyListeners.add(listener)
    this.onListenerAdded()

    return this
  }

  offAny(listener: AnyEventListener<TEvents>): this {
    if (this.anyListeners.delete(listener)) this.onListenerRemoved()

    return this
  }

  removeAllListeners(event?: EventName<TEvents>): this {
    if (event) {
      const removed = this.listeners.get(event)?.size ?? 0

      this.listeners.delete(event)
      for (let index = 0; index < removed; index += 1) this.onListenerRemoved()
    }
    else {
      const removed = this.listenerTotal()

      this.listeners.clear()
      this.anyListeners.clear()
      for (let index = 0; index < removed; index += 1) this.onListenerRemoved()
    }

    return this
  }

  protected emit<TEvent extends EventName<TEvents>>(
    event: TEvent,
    ...args: TEvents[TEvent]
  ): boolean {
    const listeners = [...(this.listeners.get(event) ?? [])]

    for (const listener of listeners) listener(...args)
    for (const listener of this.anyListeners) listener(event, ...args)

    return listeners.length > 0 || this.anyListeners.size > 0
  }

  protected onListenerAdded(): void {}

  protected onListenerRemoved(): void {}

  private listenerTotal(): number {
    let total = this.anyListeners.size

    for (const listeners of this.listeners.values()) total += listeners.size

    return total
  }
}
