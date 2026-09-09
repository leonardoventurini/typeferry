import { throttle } from './lodash'
import type EventEmitter2 from './event-emitter'

export const onceAll = async (
  emitter: EventEmitter2,
  events: readonly string[],
): Promise<void> => {
  const promises = events.map(
    event =>
      new Promise<void>(resolve => {
        emitter.once(event, () => {
          resolve()
        })
      }),
  )
  await Promise.all(promises)
}

export const waitForAll = async (
  emitter: EventEmitter2,
  events: readonly string[],
  timeout = 30000,
): Promise<void> => {
  await Promise.all(events.map(event => emitter.waitFor(event, timeout)))
}

export const onAllThrottled = (
  emitter: EventEmitter2,
  events: readonly string[],
  callback: (...args: unknown[]) => void,
  throttleMs = 1000,
  throttleOptions?: { leading?: boolean; trailing?: boolean },
): (() => void) => {
  const throttled = throttle(callback, throttleMs, throttleOptions)

  events.forEach(event => emitter.on(event, throttled))

  /**
   * Cleanup function
   */
  return () => {
    events.forEach(event => emitter.off(event, throttled))
  }
}
