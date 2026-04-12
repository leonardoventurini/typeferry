import isEqual from 'fast-deep-equal'
import { useEffect, useRef, useState } from 'react'

import { useCreation } from './use-creation'

export function useLastChangedTimestamp(obj) {
  const [timestamp, setTimestamp] = useState(() => Date.now())

  const previousObj = useRef(obj)
  const lastTimestamp = useRef(timestamp)

  useEffect(() => {
    if (!isEqual(previousObj.current, obj)) {
      previousObj.current = obj
      const nextTimestamp = Math.max(Date.now(), lastTimestamp.current + 1)
      lastTimestamp.current = nextTimestamp
      setTimestamp(nextTimestamp)
    }
  }, [obj])

  return timestamp
}

export function useObject(currentObject: Record<string, any>) {
  const timestamp = useLastChangedTimestamp(currentObject)

  return useCreation(() => currentObject, [timestamp])
}
