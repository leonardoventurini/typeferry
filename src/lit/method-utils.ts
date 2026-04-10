import isEqual from 'fast-deep-equal'
import memoizee from 'memoizee'

import type { Client } from '../client'
import type { CallOptions } from '../utils'
import { NO_CHANNEL } from '../utils'
import { isEmpty } from '../utils/lodash'
import { EJSON } from '../ejson'

export type BifrostMethodControllerOptions = {
  method?: string | null
  params?: any
  event?: string | null
  channel?: string
  defaultValue?: any
  cache?: boolean
  maxAge?: number
  deps?: any[]
  authenticated?: boolean
  debounced?: number | null
  lazy?: boolean
  http?: boolean
  parse?(params: any): any
  required?: string[]
} & CallOptions

export type NormalizedMethodControllerOptions = Required<
  Pick<
    BifrostMethodControllerOptions,
    | 'channel'
    | 'cache'
    | 'authenticated'
    | 'debounced'
    | 'lazy'
    | 'maxAge'
    | 'defaultValue'
  >
> &
  Omit<
    BifrostMethodControllerOptions,
    | 'channel'
    | 'cache'
    | 'authenticated'
    | 'debounced'
    | 'lazy'
    | 'maxAge'
    | 'defaultValue'
  >

export const DEFAULT_METHOD_CONTROLLER_OPTIONS: NormalizedMethodControllerOptions =
  {
    method: null,
    params: undefined,
    event: null,
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
    http: false,
    timeout: undefined,
    httpFallback: undefined,
    ignoreInit: undefined,
    maxRetries: undefined,
    delayBetweenRetriesMs: undefined,
  }

export function normalizeMethodControllerOptions(
  options: BifrostMethodControllerOptions = {},
): NormalizedMethodControllerOptions {
  return { ...DEFAULT_METHOD_CONTROLLER_OPTIONS, ...options }
}

export function evaluateMethodCallGate({
  parse,
  params,
  required,
}: Pick<
  NormalizedMethodControllerOptions,
  'parse' | 'params' | 'required'
>) {
  const placeholderValue = typeof parse === 'function' ? parse(params) : void 0
  const hasAllRequiredParams =
    isEmpty(required) || required.every(key => params?.[key] != null)

  if (placeholderValue !== void 0 || !hasAllRequiredParams) {
    return {
      shouldCall: false,
      placeholderValue,
    }
  }

  return {
    shouldCall: true,
    placeholderValue,
  }
}

export function createCaller(client: Client, cache: boolean, maxAge: number) {
  const boundCall = client.call.bind(client)

  if (!cache) {
    return boundCall
  }

  return memoizee(boundCall, {
    maxAge,
    promise: true,
    normalizer: args => EJSON.stringify(args),
  })
}

export function hasMethodRefreshChanged(
  current: NormalizedMethodControllerOptions,
  next: NormalizedMethodControllerOptions,
): boolean {
  return !isEqual(current, next)
}
