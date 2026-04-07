import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  METHOD_META,
  NAMESPACE_META,
  PENDING_METHOD_UPDATES,
  getOrCreateMethodMeta,
  getOrCreateNamespaceMeta,
} from './metadata'

import { Cached, NoCache } from './cached'

afterEach(() => {
  PENDING_METHOD_UPDATES.length = 0
})

describe('Cached', () => {
  describe('class decorator (context.kind === "class")', () => {
    it('sets cached=true with default maxAge on namespace meta', () => {
      class Dummy {}

      const context = { kind: 'class', name: 'Dummy' } as ClassDecoratorContext

      const result = Cached()(Dummy, context)

      expect(result).toBe(Dummy)
      const meta = NAMESPACE_META.get(Dummy)
      expect(meta).toBeDefined()
      expect(meta!.cached).toBe(true)
      expect(meta!.maxAge).toBe(60_000)
    })

    it('sets cached=true with custom maxAge', () => {
      class Dummy2 {}

      const context = {
        kind: 'class',
        name: 'Dummy2',
      } as ClassDecoratorContext

      Cached(30_000)(Dummy2, context)

      const meta = NAMESPACE_META.get(Dummy2)
      expect(meta!.cached).toBe(true)
      expect(meta!.maxAge).toBe(30_000)
    })
  })

  describe('method decorator (context.kind === "method")', () => {
    it('queues a method update that sets cached=true with default maxAge', () => {
      const fn = (() => {}) as unknown as (...args: never[]) => unknown

      const context = {
        kind: 'method',
        name: 'myMethod',
      } as ClassMethodDecoratorContext

      const result = Cached()(fn, context)

      expect(result).toBe(fn)
      expect(PENDING_METHOD_UPDATES).toHaveLength(1)

      // Flush the queued update against a dummy class
      class Host {}
      PENDING_METHOD_UPDATES[0](Host)

      const map = METHOD_META.get(Host)
      expect(map).toBeDefined()
      const meta = map!.get('myMethod')
      expect(meta).toBeDefined()
      expect(meta!.cached).toBe(true)
      expect(meta!.maxAge).toBe(60_000)
    })

    it('queues a method update that sets cached=true with custom maxAge', () => {
      const fn = (() => {}) as unknown as (...args: never[]) => unknown

      const context = {
        kind: 'method',
        name: 'anotherMethod',
      } as ClassMethodDecoratorContext

      Cached(5_000)(fn, context)

      class Host2 {}
      PENDING_METHOD_UPDATES[0](Host2)

      const meta = getOrCreateMethodMeta(Host2, 'anotherMethod')
      expect(meta.cached).toBe(true)
      expect(meta.maxAge).toBe(5_000)
    })

    it('uses String(context.name) for the method key', () => {
      const fn = (() => {}) as unknown as (...args: never[]) => unknown

      const sym = Symbol('symbolMethod')
      const context = {
        kind: 'method',
        name: sym,
      } as unknown as ClassMethodDecoratorContext

      Cached()(fn, context)

      class Host3 {}
      PENDING_METHOD_UPDATES[0](Host3)

      const map = METHOD_META.get(Host3)
      expect(map!.get(String(sym))).toBeDefined()
      expect(map!.get(String(sym))!.cached).toBe(true)
    })
  })
})

describe('NoCache', () => {
  it('queues a method update that sets cached=false', () => {
    const fn = (() => {}) as unknown as (...args: never[]) => unknown

    const context = {
      kind: 'method',
      name: 'realtime',
    } as ClassMethodDecoratorContext

    const result = NoCache()(fn, context)

    expect(result).toBe(fn)
    expect(PENDING_METHOD_UPDATES).toHaveLength(1)

    class Host {}
    // Pre-set cached to true so we can verify NoCache overrides it
    const meta = getOrCreateMethodMeta(Host, 'realtime')
    meta.cached = true

    PENDING_METHOD_UPDATES[0](Host)

    expect(meta.cached).toBe(false)
  })

  it('uses String(context.name) for the method key', () => {
    const fn = (() => {}) as unknown as (...args: never[]) => unknown

    const context = {
      kind: 'method',
      name: 'someMethod',
    } as ClassMethodDecoratorContext

    NoCache()(fn, context)

    class Host2 {}
    PENDING_METHOD_UPDATES[0](Host2)

    const map = METHOD_META.get(Host2)
    expect(map!.get('someMethod')!.cached).toBe(false)
  })
})
