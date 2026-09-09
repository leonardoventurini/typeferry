import { useMemo } from 'react'

import { isEmpty } from '../../utils/lodash'

interface CircuitBreakerOptions {
  readonly parse?: ((params: unknown) => unknown) | null
  readonly params: unknown
  readonly required: readonly string[]
  readonly deps: readonly unknown[]
}

export function useCircuitBreaker({
  parse,
  params,
  required,
  deps,
}: CircuitBreakerOptions) {
  return useMemo(() => {
    const result = typeof parse === 'function' ? parse(params) : void 0

    const hasAllRequiredParams =
      isEmpty(required) ||
      typeof params === 'object' &&
        params !== null &&
        required.every(
          key => Object.hasOwn(params, key) && Reflect.get(params, key) != null,
        )

    if (result !== void 0 || !hasAllRequiredParams) {
      return {
        shouldCall: false,
        placeholderValue: result,
      }
    }

    return { shouldCall: true }
  }, [params, parse, required, ...deps])
}
