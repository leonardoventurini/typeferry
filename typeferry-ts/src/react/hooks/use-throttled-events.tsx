import { useEffect } from 'react'

import { onAllThrottled } from '../../utils'
import type EventEmitter2 from '../../utils/event-emitter'
import { useCreation } from './use-creation'

type ThrottleOptions = {
  leading?: boolean
  trailing?: boolean
}

export function useThrottledEvents(
  emitter: EventEmitter2 | null,
  events: readonly string[],
  callback: (...args: unknown[]) => void,
  deps: readonly unknown[] = [],
  throttleMs = 1000,
  throttleOptions?: ThrottleOptions,
) {
  const _events = useCreation(() => events, events)
  const _callback = useCreation(() => callback, deps)

  useEffect(() => {
    if (!emitter) return

    return onAllThrottled(
      emitter,
      _events,
      _callback,
      throttleMs,
      throttleOptions,
    )
  }, [emitter, _events, _callback, throttleMs])
}
