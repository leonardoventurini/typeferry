import useCreation from 'ahooks/lib/useCreation'
import type { ThrottleOptions } from 'ahooks/lib/useThrottle/throttleOptions'
import { useEffect } from 'react'

import { onAllThrottled } from '../../utils'
import type EventEmitter2 from '../../utils/event-emitter'

export function useThrottledEvents(
  emitter: EventEmitter2,
  events: string[],
  callback: (...args: any[]) => void,
  deps: any[] = [],
  throttleMs = 1000,
  throttleOptions?: ThrottleOptions,
) {
  const _events = useCreation(() => events, events)
  const _callback = useCreation(() => callback, deps)

  useEffect(() => {
    return onAllThrottled(
      emitter,
      _events,
      _callback,
      throttleMs,
      throttleOptions,
    )
  }, [emitter, _events, _callback, throttleMs])
}
