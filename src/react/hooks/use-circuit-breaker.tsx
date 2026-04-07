import { useMemo } from 'react'

import { isEmpty } from 'bifrost/utils/lodash'

export function useCircuitBreaker({ parse, params, required, deps }) {
  return useMemo(() => {
    const result = typeof parse === 'function' ? parse(params) : void 0

    const hasAllRequiredParams =
      isEmpty(required) || required.every(key => params?.[key] != null)

    if (result !== void 0 || !hasAllRequiredParams) {
      return {
        shouldCall: false,
        placeholderValue: result,
      }
    }

    return { shouldCall: true }
  }, [params, parse, required, ...deps])
}
