import { afterEach, describe, expect, it } from 'vitest'

import {
  METHOD_META,
  NAMESPACE_META,
  PENDING_METHOD_UPDATES,
  getOrCreateMethodMeta,
} from './metadata'

import { Protected, Public } from './protected'

afterEach(() => {
  PENDING_METHOD_UPDATES.length = 0
})

describe('Protected', () => {
  describe('class decorator (context.kind === "class")', () => {
    it('sets protected=true on namespace meta', () => {
      class Dummy {}

      const context = { kind: 'class', name: 'Dummy' } as ClassDecoratorContext

      const result = Protected()(Dummy, context)

      expect(result).toBe(Dummy)
      const meta = NAMESPACE_META.get(Dummy)
      expect(meta).toBeDefined()
      expect(meta!.protected).toBe(true)
    })
  })

  describe('method decorator (context.kind === "method")', () => {
    it('queues a method update that sets protected=true', () => {
      const fn = (() => {}) as unknown as (...args: never[]) => unknown

      const context = {
        kind: 'method',
        name: 'secureMethod',
      } as ClassMethodDecoratorContext

      const result = Protected()(
        fn,
        context as ClassDecoratorContext | ClassMethodDecoratorContext,
      )

      expect(result).toBe(fn)
      expect(PENDING_METHOD_UPDATES).toHaveLength(1)

      class Host {}
      PENDING_METHOD_UPDATES[0](Host)

      const meta = getOrCreateMethodMeta(Host, 'secureMethod')
      expect(meta.protected).toBe(true)
    })

    it('uses String(context.name) for the method key', () => {
      const fn = (() => {}) as unknown as (...args: never[]) => unknown

      const sym = Symbol('protectedSym')
      const context = {
        kind: 'method',
        name: sym,
      } as unknown as ClassMethodDecoratorContext

      Protected()(
        fn,
        context as ClassDecoratorContext | ClassMethodDecoratorContext,
      )

      class Host2 {}
      PENDING_METHOD_UPDATES[0](Host2)

      const map = METHOD_META.get(Host2)
      expect(map!.get(String(sym))!.protected).toBe(true)
    })
  })
})

describe('Public', () => {
  it('queues a method update that sets protected=false', () => {
    const fn = (() => {}) as unknown as (...args: never[]) => unknown

    const context = {
      kind: 'method',
      name: 'openMethod',
    } as ClassMethodDecoratorContext

    const result = Public()(fn, context)

    expect(result).toBe(fn)
    expect(PENDING_METHOD_UPDATES).toHaveLength(1)

    class Host {}
    // Pre-set protected to true to verify Public overrides it
    const meta = getOrCreateMethodMeta(Host, 'openMethod')
    meta.protected = true

    PENDING_METHOD_UPDATES[0](Host)

    expect(meta.protected).toBe(false)
  })

  it('uses String(context.name) for the method key', () => {
    const fn = (() => {}) as unknown as (...args: never[]) => unknown

    const context = {
      kind: 'method',
      name: 'publicMethod',
    } as ClassMethodDecoratorContext

    Public()(fn, context)

    class Host2 {}
    PENDING_METHOD_UPDATES[0](Host2)

    const map = METHOD_META.get(Host2)
    expect(map!.get('publicMethod')!.protected).toBe(false)
  })
})
