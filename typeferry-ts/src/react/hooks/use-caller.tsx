import memoizee from 'memoizee'
import { useMemo } from 'react'

import type { Client } from '../../client'
import { EJSON } from '../../ejson'
import type { CallOptions } from '../../utils'

export type MethodCaller = (
  method: string,
  params?: unknown,
  options?: CallOptions,
) => Promise<unknown>

interface UseCallerOptions {
  readonly client: Pick<Client, 'call'> | null
  readonly cache: boolean
  readonly maxAge: number
}

export function useCaller({
  client,
  cache,
  maxAge,
}: UseCallerOptions): MethodCaller | undefined {
  return useMemo(() => {
    if (!client) return undefined

    if (!cache) return client.call

    return memoizee(client.call, {
      maxAge,
      promise: true,
      normalizer: (parameters: unknown[]) => EJSON.stringify(parameters),
    })
  }, [cache, client, maxAge])
}
