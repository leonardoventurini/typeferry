import { useCallback, useEffect } from 'react'

import { NO_CHANNEL } from '../../utils'
import { useClient } from './use-client'
import { useCreation } from './use-creation'
import { useSubscribe } from './use-subscribe'

/** Parameters for local event subscription — string shorthand or object config. */
export type UseEventParams =
  | { event: string; channel?: string; active?: boolean }
  | string

/**
 * Subscribe to a local EventEmitter2 event with automatic cleanup.
 * Supports both string shorthand (`"eventName"`) and object config.
 * The `active` flag (default `true`) controls whether the subscription is live.
 */
export function useLocalEvent<TArguments extends unknown[] = unknown[]>(
  params: UseEventParams,
  fn: (...args: TArguments) => void,
  deps: readonly unknown[] = [],
): void {
  const {
    event,
    channel = NO_CHANNEL,
    active = true,
  } = typeof params === 'string' ? { event: params } : params

  const callback = useCallback(fn, deps)
  const client = useClient()

  const ch = useCreation(
    () => (client && typeof channel === 'string' ? client.channel(channel) : client),
    [channel, client],
  )

  useEffect(() => {
    if (!active || !ch) return

    ch.on(event, callback)

    return () => {
      ch.off(event, callback)
    }
  }, [event, active, callback, ch])
}

export function useRemoteEvent<TArguments extends unknown[] = unknown[]>(
  {
    event,
    channel = NO_CHANNEL,
    active = true,
  }: Exclude<UseEventParams, string>,
  fn: (...args: TArguments) => void,
  deps: readonly unknown[] = [],
): boolean {
  return useSubscribe(
    {
      event,
      channel,
      active,
    },
    fn,
    deps,
  )
}
