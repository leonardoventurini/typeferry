import useCreation from 'ahooks/lib/useCreation'

import { useCallback, useEffect } from 'react'

import { NO_CHANNEL } from '../../utils'
import { useClient } from './use-client'
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
export function useLocalEvent(
  params: UseEventParams,
  fn: (...args: unknown[]) => void,
  deps: unknown[] = [],
): void {
  const {
    event,
    channel = NO_CHANNEL,
    active = true,
  } = typeof params === 'string' ? { event: params } : params

  const callback = useCallback(fn, deps)
  const client = useClient()

  const ch = useCreation(
    () => (typeof channel === 'string' ? client.channel(channel) : client),
    [channel],
  )

  useEffect(() => {
    if (!active) return

    ch.on(event, callback)

    return () => {
      ch.off(event, callback)
    }
  }, [event, active, callback, ch])
}

export function useRemoteEvent(
  {
    event,
    channel = NO_CHANNEL,
    active = true,
  }: Exclude<UseEventParams, string>,
  fn: (...args: unknown[]) => void,
  deps: unknown[] = [],
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
