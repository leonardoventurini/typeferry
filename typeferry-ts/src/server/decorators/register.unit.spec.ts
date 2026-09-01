import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { METHOD_META, NAMESPACE_META } from './metadata'
import type { MethodMeta, NamespaceMeta } from './metadata'
import { registerNamespace } from './register'

describe('registerNamespace', () => {
  let mockAddMethod: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockAddMethod = vi.fn()
    ;(globalThis as any).TypeFerry = { addMethod: mockAddMethod }
  })

  afterEach(() => {
    delete (globalThis as any).TypeFerry
  })

  it('throws when class is missing @Namespace decorator', () => {
    class NoDecorator {}

    expect(() => registerNamespace(NoDecorator)).toThrow(
      'missing @Namespace decorator',
    )
  })

  it('throws when namespace has no @Method-decorated members', () => {
    class EmptyNamespace {}

    const nsMeta: NamespaceMeta = {
      prefix: 'test',
      protected: false,
      cached: false,
      maxAge: 60_000,
    }
    NAMESPACE_META.set(EmptyNamespace, nsMeta)

    expect(() => registerNamespace(EmptyNamespace)).toThrow(
      'has no @Method-decorated members',
    )

    // Clean up
    NAMESPACE_META.delete(EmptyNamespace)
  })

  it('registers methods with TypeFerry.addMethod', () => {
    class MyNamespace {
      greet(_client: any, _params: any) {
        return 'hello'
      }
    }

    const nsMeta: NamespaceMeta = {
      prefix: 'ns',
      protected: false,
      cached: false,
      maxAge: 60_000,
    }
    NAMESPACE_META.set(MyNamespace, nsMeta)

    const methodMap = new Map<string, MethodMeta>()
    methodMap.set('greet', {
      name: 'greet',
      middleware: [],
    })
    METHOD_META.set(MyNamespace, methodMap)

    registerNamespace(MyNamespace)

    expect(mockAddMethod).toHaveBeenCalledWith(
      'ns.greet',
      expect.any(Function),
      expect.objectContaining({ protected: false }),
    )

    // Clean up
    NAMESPACE_META.delete(MyNamespace)
    METHOD_META.delete(MyNamespace)
  })

  it('registers method without prefix when prefix is empty', () => {
    class NoPrefix {
      doStuff(_client: any, _params: any) {
        return 'done'
      }
    }

    const nsMeta: NamespaceMeta = {
      prefix: '',
      protected: false,
      cached: false,
      maxAge: 60_000,
    }
    NAMESPACE_META.set(NoPrefix, nsMeta)

    const methodMap = new Map<string, MethodMeta>()
    methodMap.set('doStuff', {
      name: 'doStuff',
      middleware: [],
    })
    METHOD_META.set(NoPrefix, methodMap)

    registerNamespace(NoPrefix)

    expect(mockAddMethod).toHaveBeenCalledWith(
      'doStuff',
      expect.any(Function),
      expect.any(Object),
    )

    // Clean up
    NAMESPACE_META.delete(NoPrefix)
    METHOD_META.delete(NoPrefix)
  })

  it('merges class-level and method-level options', () => {
    class ProtectedNs {
      secret(_client: any, _params: any) {
        return 'secret'
      }
    }

    const nsMeta: NamespaceMeta = {
      prefix: 'secure',
      protected: true,
      cached: true,
      maxAge: 30_000,
    }
    NAMESPACE_META.set(ProtectedNs, nsMeta)

    const methodMap = new Map<string, MethodMeta>()
    methodMap.set('secret', {
      name: 'secret',
      middleware: [],
      // No method-level overrides, so inherits from namespace
    })
    METHOD_META.set(ProtectedNs, methodMap)

    registerNamespace(ProtectedNs)

    expect(mockAddMethod).toHaveBeenCalledWith(
      'secure.secret',
      expect.any(Function),
      expect.objectContaining({
        protected: true,
        cache: true,
        maxAge: 30_000,
      }),
    )

    // Clean up
    NAMESPACE_META.delete(ProtectedNs)
    METHOD_META.delete(ProtectedNs)
  })

  it('throws when decorated property is not a function (line 92)', () => {
    class BadNamespace {
      notAMethod = 'just a string'
    }

    const nsMeta: NamespaceMeta = {
      prefix: 'bad',
      protected: false,
      cached: false,
      maxAge: 60_000,
    }
    NAMESPACE_META.set(BadNamespace, nsMeta)

    const methodMap = new Map<string, MethodMeta>()
    methodMap.set('notAMethod', {
      name: 'notAMethod',
      middleware: [],
    })
    METHOD_META.set(BadNamespace, methodMap)

    expect(() => registerNamespace(BadNamespace)).toThrow(
      'is not a function',
    )

    // Clean up
    NAMESPACE_META.delete(BadNamespace)
    METHOD_META.delete(BadNamespace)
  })

  it('wraps method to pass ClientNode as this context', () => {
    class WrapTest {
      echo(client: any, params: any) {
        return { client, params }
      }
    }

    const nsMeta: NamespaceMeta = {
      prefix: 'wrap',
      protected: false,
      cached: false,
      maxAge: 60_000,
    }
    NAMESPACE_META.set(WrapTest, nsMeta)

    const methodMap = new Map<string, MethodMeta>()
    methodMap.set('echo', {
      name: 'echo',
      middleware: [],
    })
    METHOD_META.set(WrapTest, methodMap)

    registerNamespace(WrapTest)

    // Get the wrapped function that was passed to addMethod
    const wrappedFn = mockAddMethod.mock.calls[0][1]

    // Call it with a mock ClientNode as `this`
    const mockNode = { uuid: 'test-node' }
    const result = wrappedFn.call(mockNode, { key: 'value' })

    expect(result).toEqual({
      client: mockNode,
      params: { key: 'value' },
    })

    // Clean up
    NAMESPACE_META.delete(WrapTest)
    METHOD_META.delete(WrapTest)
  })

  it('includes middleware in options when present', () => {
    class MwTest {
      handler(_client: any, _params: any) {
        return 'ok'
      }
    }

    const middlewareFn = vi.fn()
    const nsMeta: NamespaceMeta = {
      prefix: 'mw',
      protected: false,
      cached: false,
      maxAge: 60_000,
    }
    NAMESPACE_META.set(MwTest, nsMeta)

    const methodMap = new Map<string, MethodMeta>()
    methodMap.set('handler', {
      name: 'handler',
      middleware: [middlewareFn],
    })
    METHOD_META.set(MwTest, methodMap)

    registerNamespace(MwTest)

    expect(mockAddMethod).toHaveBeenCalledWith(
      'mw.handler',
      expect.any(Function),
      expect.objectContaining({
        middleware: [middlewareFn],
      }),
    )

    // Clean up
    NAMESPACE_META.delete(MwTest)
    METHOD_META.delete(MwTest)
  })
})
