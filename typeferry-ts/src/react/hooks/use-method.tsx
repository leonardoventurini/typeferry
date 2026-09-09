import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'

import type { CallOptions } from '../../utils'
import type { Client } from '../../client'
import { TypeFerryEvents, ClientEvents, NO_CHANNEL } from '../../utils'
import { useCaller } from './use-caller'
import { useCircuitBreaker } from './use-circuit-breaker'
import { useClient } from './use-client'
import { useLocalEvent, useRemoteEvent } from './use-local-event'
import { useMethodRefresh } from './use-method-refresh'

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = (): void => {}

export type UseMethodParams<TParams = unknown, TResult = unknown> = {
  method?: string
  params?: TParams
  event?: string
  channel?: string
  defaultValue?: TResult
  cache?: boolean
  maxAge?: number
  timeout?: number
  deps?: readonly unknown[]
  authenticated?: boolean
  debounced?: number
  lazy?: boolean
  http?: boolean
  parse?(params: TParams): TResult | undefined
  required?: string[]
} & CallOptions

function useOptimistic(
  result: unknown,
  setResult: (value: unknown) => void,
) {
  return useCallback(
    (cb: (current: unknown) => unknown) => {
      if (typeof cb !== 'function') throw new Error('Function Expected')
      const simulatedResult = cb(result)
      setResult(simulatedResult)
    },
    [result, setResult],
  )
}

function useInitializingHandler(
  authenticated: boolean,
  setLoading: (v: boolean) => void,
) {
  useLocalEvent(
    { event: ClientEvents.INITIALIZING },
    () => {
      if (authenticated) setLoading(true)
    },
    [authenticated],
  )
}

function useInitializedHandler(
  authenticated: boolean,
  refreshCallback: () => void,
) {
  useLocalEvent(
    { event: ClientEvents.INITIALIZED },
    () => {
      if (authenticated) refreshCallback()
    },
    [refreshCallback, authenticated],
  )
}

function useLogoutHandler(authenticated: boolean, refreshCallback: () => void) {
  useLocalEvent(
    { event: ClientEvents.LOGOUT },
    () => {
      if (authenticated) refreshCallback()
    },
    [refreshCallback, authenticated],
  )
}

function useMethodRefreshEvent(
  channel: string,
  method: string | undefined,
  refreshCallback: () => void,
) {
  useRemoteEvent(
    {
      event: TypeFerryEvents.METHOD_REFRESH,
      channel,
      active: method !== undefined,
    },
    (refreshMethod: string) => {
      if (refreshMethod === method) refreshCallback()
    },
    [refreshCallback],
  )
}

function useAutoRefresh(
  method: string | undefined,
  client: Client | null,
  lazy: boolean,
  refreshCallback: () => void,
  params: unknown,
  debounced: number | null,
) {
  useEffect(() => {
    if (!method || !client) return
    if (!lazy) refreshCallback()
  }, [client, method, params, debounced])
}

function useCleanup(debouncedRefresh: { cancel: () => void }) {
  useEffect(
    () => () => {
      debouncedRefresh.cancel()
    },
    [],
  )
}

function useEventSubscriptions(
  authenticated: boolean,
  setLoading: (v: boolean) => void,
  refreshCallback: () => void,
  event: string | undefined,
  channel: string,
  method: string | undefined,
) {
  useInitializingHandler(authenticated, setLoading)
  useInitializedHandler(authenticated, refreshCallback)
  useLogoutHandler(authenticated, refreshCallback)
  useLocalEvent(
    { event: event ?? '', channel, active: event !== undefined },
    refreshCallback,
    [refreshCallback],
  )
  useMethodRefreshEvent(channel, method, refreshCallback)
}

const DEFAULT_OPTIONS = {
  method: undefined,
  params: undefined,
  event: undefined,
  channel: NO_CHANNEL,
  defaultValue: null,
  cache: false,
  maxAge: 60000,
  deps: [],
  authenticated: false,
  debounced: null,
  parse: null,
  lazy: false,
  required: [],
}

function normalizeOptions(options: UseMethodParams) {
  return { ...DEFAULT_OPTIONS, ...options }
}

function useMethodState(lazy: boolean) {
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<unknown>(null)
  const [loading, setLoading] = useState(!lazy)
  return { error, setError, result, setResult, loading, setLoading }
}

function useRefreshCallback(
  refresh: () => void,
  debouncedRefresh: ReturnType<typeof useDebouncedCallback>,
  debounced: number | null,
) {
  return useMemo(
    () => (debounced ? debouncedRefresh : refresh),
    [debounced, debouncedRefresh, refresh],
  )
}

function useMethodCore(options: ReturnType<typeof normalizeOptions>) {
  const {
    method,
    params: _params,
    event,
    channel,
    defaultValue: _defaultValue,
    cache,
    maxAge,
    deps,
    authenticated,
    debounced,
    parse,
    lazy,
    required,
    ...methodOptions
  } = options

  const client = useClient()
  const defaultValue = useMemo(() => _defaultValue, deps)
  const params = useMemo(() => _params, deps)

  const { error, setError, result, setResult, loading, setLoading } =
    useMethodState(lazy)
  const { shouldCall, placeholderValue } = useCircuitBreaker({
    parse,
    params,
    required,
    deps,
  })

  const optimistic = useOptimistic(result, setResult)
  const startLoading = useDebouncedCallback(() => setLoading(true), 100)
  const caller = useCaller({ cache, client, maxAge })

  const refresh = useMethodRefresh({
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
  })

  const debouncedRefresh = useDebouncedCallback(refresh, debounced ?? 100)
  const refreshCallback = useRefreshCallback(
    refresh,
    debouncedRefresh,
    debounced,
  )

  useEventSubscriptions(
    authenticated,
    setLoading,
    refreshCallback,
    event,
    channel,
    method,
  )
  useAutoRefresh(method, client, lazy, refreshCallback, params, debounced)
  useCleanup(debouncedRefresh)

  return {
    shouldCall,
    placeholderValue,
    defaultValue,
    error,
    loading,
    result,
    refreshCallback,
    optimistic,
    client,
  }
}

export const useMethod = (options: UseMethodParams) => {
  const normalized = normalizeOptions(options)
  if (!normalized.method) throw new Error('Method name is required.')

  const core = useMethodCore(normalized)

  if (!core.shouldCall) {
    return {
      result: core.placeholderValue ?? core.defaultValue,
      error: core.error,
      loading: false,
      refresh: noop,
      optimistic: noop,
      client: core.client,
    }
  }

  return {
    result: core.result ?? core.defaultValue,
    error: core.error,
    loading: core.loading,
    refresh: core.refreshCallback,
    optimistic: core.optimistic,
    client: core.client,
  }
}
