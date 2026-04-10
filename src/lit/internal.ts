import isEqual from 'fast-deep-equal'
import type { EventEmitter2 } from 'eventemitter2'
import type { ReactiveController, ReactiveControllerHost } from 'lit'

import { Client } from '../client'
import { onAllThrottled } from '../utils/events'

export interface BifrostClientProvider {
  client: Client | null | undefined
}

export type BifrostClientSource =
  | Client
  | BifrostClientProvider
  | (() => Client | null | undefined)
  | null
  | undefined

export function resolveClient(source: BifrostClientSource): Client | null {
  if (!source) return null

  if (typeof source === 'function') {
    return resolveClient(source())
  }

  if (source instanceof Client) {
    return source
  }

  if (typeof source === 'object' && 'client' in source) {
    return resolveClient((source as BifrostClientProvider).client)
  }

  const maybeClient = source as Client
  if (
    typeof maybeClient?.call === 'function' &&
    typeof maybeClient?.channel === 'function'
  ) {
    return maybeClient
  }

  return null
}

export function requireClient(
  source: BifrostClientSource,
  message = 'Client Not Found',
): Client {
  const client = resolveClient(source)

  if (!client) {
    throw new Error(message)
  }

  return client
}

export abstract class BifrostReactiveController implements ReactiveController {
  private cleanups: Array<() => void> = []

  constructor(protected readonly host: ReactiveControllerHost) {}

  protected attach(): void {
    this.host.addController(this)
  }

  protected requestUpdate(): void {
    this.host.requestUpdate()
  }

  protected addCleanup(cleanup: () => void): () => void {
    this.cleanups.push(cleanup)
    return cleanup
  }

  protected clearCleanups(): void {
    while (this.cleanups.length) {
      const cleanup = this.cleanups.pop()

      try {
        cleanup?.()
      } catch {
        // Best-effort cleanup. Individual listeners should never block teardown.
      }
    }
  }

  protected listen(
    emitter: Pick<EventEmitter2, 'on' | 'off'>,
    event: string,
    callback: (...args: any[]) => void,
  ): void {
    emitter.on(event, callback)
    this.addCleanup(() => emitter.off(event, callback))
  }

  protected listenThrottled(
    emitter: EventEmitter2,
    events: string[],
    callback: (...args: any[]) => void,
    throttleMs = 16,
  ): void {
    this.addCleanup(
      onAllThrottled(emitter, events, callback, throttleMs, {
        leading: true,
        trailing: true,
      }),
    )
  }

  hostConnected(): void {}

  hostDisconnected(): void {
    this.clearCleanups()
  }

  protected cloneIfChanged<T>(current: T, next: T): T {
    return isEqual(current, next) ? current : next
  }
}
