import memoizee from 'memoizee'
import { useCallback } from 'react'

import { EJSON } from '../../ejson'

export const useCaller = ({ client, cache, maxAge }) => {
  return useCallback(
    cache
      ? memoizee(client?.call, {
          maxAge,
          promise: true,
          normalizer: p => EJSON.stringify(p),
        })
      : client?.call,
    [cache, client],
  )
}
