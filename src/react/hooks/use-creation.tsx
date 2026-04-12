import { useRef } from 'react'

type CreationCache<T> = {
  deps: readonly unknown[]
  value: T
}

/**
 * Avoids CommonJS interop in published browser bundles while preserving the
 * stable instance semantics Bifrost's providers and event hooks depend on.
 */
export function useCreation<T>(factory: () => T, deps: readonly unknown[]): T {
  const cache = useRef<CreationCache<T> | null>(null)
  if (!cache.current || !areDepsEqual(cache.current.deps, deps)) {
    cache.current = { deps: [...deps], value: factory() }
  }
  return cache.current.value
}

function areDepsEqual(
  previousDeps: readonly unknown[],
  nextDeps: readonly unknown[],
): boolean {
  return (
    previousDeps.length === nextDeps.length &&
    previousDeps.every((dep, index) => Object.is(dep, nextDeps[index]))
  )
}
