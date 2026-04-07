import type { Client, ProxyMethodCall } from './client'

/**
 * Properties that must return primitive-producing functions to prevent
 * "Cannot convert object to primitive value" when the proxy is coerced
 * (e.g. string concatenation, JSON.stringify, devtools inspection).
 */
const COERCION_PROPS = new Set(['toString', 'valueOf', 'toJSON'])

export function callMethodProxy(client: Client, path = ''): ProxyMethodCall {
  return new Proxy(function () {} as ProxyMethodCall, {
    get(_, prop) {
      if (typeof prop === 'symbol') return undefined
      if (COERCION_PROPS.has(prop)) return () => path
      const newPath = path ? `${path}.${prop}` : prop
      return callMethodProxy(client, newPath)
    },
    apply(_, __, args) {
      return client.call(path, ...args)
    },
  })
}
