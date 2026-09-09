import type { Dispatch, SetStateAction } from 'react'
import { useCallback } from 'react'

import type { Client } from '../../client'
import type { CallOptions } from '../../utils'
import type { MethodCaller } from './use-caller'

type StartLoading = (() => void) & { cancel(): void }

interface UseMethodRefreshOptions {
  readonly authenticated: boolean
  readonly caller: MethodCaller | undefined
  readonly client: Client | null
  readonly params: unknown
  readonly method: string | undefined
  readonly setError: Dispatch<SetStateAction<unknown>>
  readonly setLoading: Dispatch<SetStateAction<boolean>>
  readonly setResult: Dispatch<SetStateAction<unknown>>
  readonly shouldCall: boolean
  readonly startLoading: StartLoading
  readonly methodOptions: CallOptions
  readonly defaultValue: unknown
  readonly deps: readonly unknown[]
}

export function useMethodRefresh({
  authenticated,
  caller,
  client,
  params,
  method,
  setError,
  setLoading,
  setResult,
  shouldCall,
  startLoading,
  methodOptions,
  defaultValue,
  deps,
}: UseMethodRefreshOptions): (callback?: () => void) => void {
  return useCallback(
    (callback?: () => void) => {
      if (!method || !shouldCall || !caller || !client) return

      if (authenticated && !client.authenticated) {
        setLoading(false)
        setResult(defaultValue)
        return
      }

      startLoading()

      caller.call(client, method, params, methodOptions)
        .then(result => {
          setResult(result)
          setError(undefined)
        })
        .catch((error: unknown) => {
          console.error(error)
          setError(error)
          setResult(undefined)
        })
        .finally(() => {
          startLoading.cancel()
          setLoading(false)
          if (typeof callback === 'function') callback()
        })
    },
    [
      authenticated,
      caller,
      client,
      defaultValue,
      deps,
      method,
      methodOptions,
      params,
      setError,
      setLoading,
      setResult,
      shouldCall,
      startLoading,
    ],
  )
}
