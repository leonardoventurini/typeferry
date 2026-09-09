import { useEffect, useState } from 'react'

import { NO_CHANNEL } from '../../utils'
import type { EventListener } from '../../utils/event-emitter'
import { useClient } from './use-client'
import { useCreation } from './use-creation'

type UseSubscribeParams = {
  event: string
  channel?: string
  active?: boolean
}

export function useSubscribe<TArguments extends unknown[] = unknown[]>(
  { event, channel = NO_CHANNEL, active = true }: UseSubscribeParams,
  callback?: ((...args: TArguments) => unknown) | null,
  deps: readonly unknown[] = [],
): boolean {
  if (typeof event !== 'string') {
    throw new Error('event name is required')
  }

  if (typeof channel !== 'string' && active) {
    throw new Error('channel name is required')
  }

  const client = useClient()
  const [ready, setReady] = useState(false)

  const _channel = useCreation(
    () => client?.channel(channel) ?? null,
    [client, channel],
  )

  useEffect(() => {
    if (!callback || !active || !_channel) return

    const events = _channel._events[event]

    const isAlreadyRegistered =
      events === callback ||
      (Array.isArray(events) && events.includes(callback))

    if (!isAlreadyRegistered) {
      _channel.on(event, callback as EventListener)
    }

    return () => {
      _channel.off(event, callback as EventListener)
    }
  }, [event, channel, callback, active, ...deps])

  useEffect(() => {
    if (!active || !_channel) return

    _channel
      .subscribe(event)
      .then(result => setReady(result?.[event] ?? false))
      .catch(console.error)

    return () => {
      // Prevent unsubscribing too early due to simple re-rendering
      setTimeout(() => {
        // Only unsubscribe if there are no other listeners
        const listeners = _channel._events[event]
        const hasListeners = Array.isArray(listeners)
          ? listeners.length > 0
          : listeners !== undefined

        if (!hasListeners) {
          _channel.unsubscribe(event).catch(console.error)
        }
      }, 1000)
    }
  }, [event, channel, active])

  return ready
}
