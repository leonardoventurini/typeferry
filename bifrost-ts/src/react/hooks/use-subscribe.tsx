import { useEffect, useState } from 'react'

import type { AnyFunction } from '../../utils'
import { NO_CHANNEL } from '../../utils'
import { useClient } from './use-client'
import { useCreation } from './use-creation'

type UseSubscribeParams = {
  event: string
  channel?: string
  active?: boolean
}

export function useSubscribe(
  { event, channel = NO_CHANNEL, active = true }: UseSubscribeParams,
  callback: AnyFunction = null,
  deps: any[] = [],
) {
  if (typeof event !== 'string') {
    throw new Error('event name is required')
  }

  if (typeof channel !== 'string' && active) {
    throw new Error('channel name is required')
  }

  const client = useClient()
  const [ready, setReady] = useState(false)

  const _channel = useCreation(() => client.channel(channel), [client, channel])

  useEffect(() => {
    if (!callback) return
    if (!active) return

    const events = _channel._events?.[event] as AnyFunction[] | AnyFunction

    const isAlreadyRegistered =
      events === callback ||
      (Array.isArray(events) && events.includes(callback))

    if (!isAlreadyRegistered) {
      _channel.on(event, callback)
    }

    return () => {
      _channel.off(event, callback)
    }
  }, [event, channel, callback, active].concat(deps))

  useEffect(() => {
    if (!active) return

    _channel
      .subscribe(event)
      .then(result => setReady(result?.[event] ?? false))
      .catch(console.error)

    return () => {
      // Prevent unsubscribing too early due to simple re-rendering
      setTimeout(() => {
        // Only unsubscribe if there are no other listeners
        if (!_channel._events[event]?.length) {
          _channel.unsubscribe(event).catch(console.error)
        }
      }, 1000)
    }
  }, [event, channel, active])

  return ready
}
