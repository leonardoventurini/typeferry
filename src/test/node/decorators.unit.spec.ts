/**
 * Unit tests for the Bifrost decorator API.
 *
 * Tests metadata storage, decorator composition, class/method-level defaults,
 * cross-class isolation (pending queue), and the registerNamespace bridge
 * to global.Bifrost.addMethod().
 */

/* eslint-disable @typescript-eslint/no-extraneous-class */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest'
import { z } from 'zod'

import type { ClientNode } from 'bifrost/server/client-node'
import type { InferNamespace } from 'bifrost/server/decorators/infer'
import {
  METHOD_META,
  NAMESPACE_META,
  PENDING_METHOD_UPDATES,
} from 'bifrost/server/decorators/metadata'
import type { CallOptions } from 'bifrost/utils'

import {
  Cached,
  Method,
  Namespace,
  NoCache,
  Protected,
  Public,
  registerNamespace,
  Schema,
  Use,
} from '../../server/decorators'

describe('Bifrost Decorators', () => {
  describe('@Namespace', () => {
    it('should store the prefix on the class constructor', () => {
      @Namespace('boards')
      class TestNs {}

      const meta = NAMESPACE_META.get(TestNs)
      expect(meta?.prefix).toBe('boards')
    })

    it('should default protected/cached to false', () => {
      @Namespace('test')
      class TestNs {}

      const meta = NAMESPACE_META.get(TestNs)
      expect(meta?.protected).toBe(false)
      expect(meta?.cached).toBe(false)
    })

    it('should flush all pending method updates', () => {
      @Namespace('test')
      class TestNs {
        @Method()
        async get(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      // Pending queue should be empty after @Namespace runs
      expect(PENDING_METHOD_UPDATES).toHaveLength(0)

      const methods = METHOD_META.get(TestNs)
      expect(methods?.has('get')).toBe(true)
    })
  })

  describe('@Protected', () => {
    it('should set protected: true on namespace meta', () => {
      @Namespace('secure')
      @Protected()
      class SecureNs {}

      const meta = NAMESPACE_META.get(SecureNs)
      expect(meta?.protected).toBe(true)
    })

    it('should work regardless of decorator order with @Namespace', () => {
      @Protected()
      @Namespace('secure')
      class SecureNs {}

      const meta = NAMESPACE_META.get(SecureNs)
      expect(meta?.protected).toBe(true)
      expect(meta?.prefix).toBe('secure')
    })
  })

  describe('@Cached', () => {
    it('should set cached: true with default maxAge on class', () => {
      @Namespace('cached')
      @Cached()
      class CachedNs {}

      const meta = NAMESPACE_META.get(CachedNs)
      expect(meta?.cached).toBe(true)
      expect(meta?.maxAge).toBe(60_000)
    })

    it('should accept custom maxAge on class', () => {
      @Namespace('cached')
      @Cached(30_000)
      class CachedNs {}

      const meta = NAMESPACE_META.get(CachedNs)
      expect(meta?.maxAge).toBe(30_000)
    })
  })

  describe('@Method', () => {
    it('should store method name matching the property key', () => {
      @Namespace('test')
      class TestNs {
        @Method()
        async get(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      const methods = METHOD_META.get(TestNs)
      expect(methods?.has('get')).toBe(true)
      expect(methods?.get('get')?.name).toBe('get')
    })

    it('should allow name override', () => {
      @Namespace('test')
      class TestNs {
        @Method('deleteBoard')
        async remove(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      const methods = METHOD_META.get(TestNs)
      expect(methods?.get('remove')?.name).toBe('deleteBoard')
    })
  })

  describe('@Schema', () => {
    it('should attach a Zod schema to the method', () => {
      const schema = z.object({ boardId: z.string() })

      @Namespace('test')
      class TestNs {
        @Method()
        @Schema(schema)
        async get(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      const methods = METHOD_META.get(TestNs)
      expect(methods?.get('get')?.schema).toBe(schema)
    })
  })

  describe('@Use', () => {
    it('should attach middleware in order', () => {
      const mw1 = vi.fn()
      const mw2 = vi.fn()

      @Namespace('test')
      class TestNs {
        @Method()
        @Use(mw1, mw2)
        async get(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      const methods = METHOD_META.get(TestNs)
      const middleware = methods?.get('get')?.middleware
      expect(middleware).toEqual([mw1, mw2])
    })

    it('should stack multiple @Use decorators', () => {
      const mw1 = vi.fn()
      const mw2 = vi.fn()

      @Namespace('test')
      class TestNs {
        @Method()
        @Use(mw1)
        @Use(mw2)
        async get(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      const methods = METHOD_META.get(TestNs)
      const middleware = methods?.get('get')?.middleware
      expect(middleware).toHaveLength(2)
      expect(middleware).toContain(mw1)
      expect(middleware).toContain(mw2)
    })
  })

  describe('@Public', () => {
    it('should override class-level @Protected for a specific method', () => {
      @Namespace('test')
      @Protected()
      class TestNs {
        @Method()
        @Public()
        async open(_client: ClientNode, _params: unknown) {
          return null
        }

        @Method()
        async secure(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      const methods = METHOD_META.get(TestNs)
      expect(methods?.get('open')?.protected).toBe(false)
      expect(methods?.get('secure')?.protected).toBeUndefined()
    })
  })

  describe('@NoCache', () => {
    it('should disable caching for a specific method', () => {
      @Namespace('test')
      @Cached(30_000)
      class TestNs {
        @Method()
        @NoCache()
        async realtime(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      const methods = METHOD_META.get(TestNs)
      expect(methods?.get('realtime')?.cached).toBe(false)
    })
  })

  describe('cross-class isolation', () => {
    it('should not leak method metadata between classes in the same scope', () => {
      @Namespace('alpha')
      class AlphaMethods {
        @Method()
        async synthesize(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      @Namespace('beta')
      class BetaMethods {
        @Method()
        async generate(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      const alphaMethods = METHOD_META.get(AlphaMethods)
      const betaMethods = METHOD_META.get(BetaMethods)

      // Alpha should only have 'synthesize', not 'generate'
      expect(alphaMethods?.has('synthesize')).toBe(true)
      expect(alphaMethods?.has('generate')).toBe(false)

      // Beta should only have 'generate', not 'synthesize'
      expect(betaMethods?.has('generate')).toBe(true)
      expect(betaMethods?.has('synthesize')).toBe(false)
    })

    it('should not leak schema/middleware between classes', () => {
      const schema = z.object({ id: z.string() })
      const mw = vi.fn()

      @Namespace('first')
      class FirstMethods {
        @Method()
        @Schema(schema)
        @Use(mw)
        async action(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      @Namespace('second')
      class SecondMethods {
        @Method()
        async action(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      const firstMeta = METHOD_META.get(FirstMethods)?.get('action')
      const secondMeta = METHOD_META.get(SecondMethods)?.get('action')

      expect(firstMeta?.schema).toBe(schema)
      expect(firstMeta?.middleware).toContain(mw)

      expect(secondMeta?.schema).toBeUndefined()
      expect(secondMeta?.middleware).toHaveLength(0)
    })

    it('should isolate @Protected/@Public across classes', () => {
      @Namespace('secure')
      @Protected()
      class SecureMethods {
        @Method()
        @Public()
        async open(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      @Namespace('open')
      class OpenMethods {
        @Method()
        async action(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      const secureMeta = METHOD_META.get(SecureMethods)?.get('open')
      const openMeta = METHOD_META.get(OpenMethods)?.get('action')

      expect(secureMeta?.protected).toBe(false)
      // Should NOT inherit SecureMethods' @Public
      expect(openMeta?.protected).toBeUndefined()
    })
  })

  describe('registerNamespace', () => {
    let addMethodSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      addMethodSpy = vi.fn()
      global.Bifrost = { addMethod: addMethodSpy } as never
    })

    afterEach(() => {
      delete (global as Record<string, unknown>).Bifrost
    })

    it('should call addMethod with full prefixed name', () => {
      @Namespace('ai.test')
      class TestMethods {
        @Method('run')
        async run(_client: ClientNode, _params: unknown) {
          return 'ok'
        }
      }

      registerNamespace(TestMethods)

      expect(addMethodSpy).toHaveBeenCalledOnce()
      expect(addMethodSpy.mock.calls[0][0]).toBe('ai.test.run')
    })

    it('should pass protected: true from class-level @Protected', () => {
      @Namespace('secure')
      @Protected()
      class SecureMethods {
        @Method()
        async action(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      registerNamespace(SecureMethods)

      const opts = addMethodSpy.mock.calls[0][2]
      expect(opts.protected).toBe(true)
    })

    it('should pass protected: false when method has @Public', () => {
      @Namespace('mixed')
      @Protected()
      class MixedMethods {
        @Method()
        @Public()
        async open(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      registerNamespace(MixedMethods)

      const opts = addMethodSpy.mock.calls[0][2]
      expect(opts.protected).toBe(false)
    })

    it('should pass schema and middleware', () => {
      const schema = z.object({ id: z.string() })
      const mw = vi.fn()

      @Namespace('test')
      class TestMethods {
        @Method()
        @Schema(schema)
        @Use(mw)
        async get(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      registerNamespace(TestMethods)

      const opts = addMethodSpy.mock.calls[0][2]
      expect(opts.schema).toBe(schema)
      expect(opts.middleware).toEqual([mw])
    })

    it('should inject ClientNode as first arg when wrapper is called', async () => {
      const receivedClient: ClientNode[] = []

      @Namespace('inject')
      class InjectMethods {
        @Method()
        async action(client: ClientNode, _params: unknown) {
          receivedClient.push(client)
          return 'done'
        }
      }

      registerNamespace(InjectMethods)

      const wrappedFn = addMethodSpy.mock.calls[0][1]
      const mockClient = { userId: 'user-123' } as unknown as ClientNode

      await wrappedFn.call(mockClient, { foo: 'bar' })

      expect(receivedClient).toHaveLength(1)
      expect(receivedClient[0]).toBe(mockClient)
    })

    it('should register multiple methods from one class', () => {
      @Namespace('multi')
      class MultiMethods {
        @Method()
        async get(_client: ClientNode, _params: unknown) {
          return null
        }

        @Method()
        async create(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      registerNamespace(MultiMethods)

      expect(addMethodSpy).toHaveBeenCalledTimes(2)

      const names = addMethodSpy.mock.calls.map((c: unknown[]) => c[0])
      expect(names).toContain('multi.get')
      expect(names).toContain('multi.create')
    })

    it('should merge class-level @Cached with method-level @NoCache', () => {
      @Namespace('cache')
      @Cached(30_000)
      class CacheMethods {
        @Method()
        async cached(_client: ClientNode, _params: unknown) {
          return null
        }

        @Method()
        @NoCache()
        async realtime(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      registerNamespace(CacheMethods)

      const calls = addMethodSpy.mock.calls as [
        string,
        unknown,
        Record<string, unknown>,
      ][]
      const cachedOpts = calls.find(c => c[0] === 'cache.cached')?.[2]
      const realtimeOpts = calls.find(c => c[0] === 'cache.realtime')?.[2]

      expect(cachedOpts?.cache).toBe(true)
      expect(cachedOpts?.maxAge).toBe(30_000)
      expect(realtimeOpts?.cache).toBeUndefined()
    })

    it('should not leak methods between classes registered sequentially', () => {
      @Namespace('ns1')
      class Ns1Methods {
        @Method()
        async action1(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      @Namespace('ns2')
      class Ns2Methods {
        @Method()
        async action2(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      registerNamespace(Ns1Methods)
      registerNamespace(Ns2Methods)

      expect(addMethodSpy).toHaveBeenCalledTimes(2)

      const names = addMethodSpy.mock.calls.map((c: unknown[]) => c[0])
      expect(names).toContain('ns1.action1')
      expect(names).toContain('ns2.action2')
      expect(names).not.toContain('ns1.action2')
      expect(names).not.toContain('ns2.action1')
    })

    it('should throw if class has no @Method members', () => {
      @Namespace('empty')
      class EmptyNs {}

      expect(() => registerNamespace(EmptyNs)).toThrow('no @Method-decorated')
    })

    it('should throw if class has no @Namespace', () => {
      class NoNs {
        @Method()
        async get(_client: ClientNode, _params: unknown) {
          return null
        }
      }

      expect(() => registerNamespace(NoNs)).toThrow('missing @Namespace')

      // @Method without @Namespace leaves stale entries — drain them
      PENDING_METHOD_UPDATES.length = 0
    })
  })

  describe('InferNamespace', () => {
    it('should produce nested types from prefix', () => {
      class TestMethods {
        async get(
          _client: ClientNode,
          _params: { id: string },
        ): Promise<{ name: string }> {
          return { name: 'test' }
        }
      }

      type Result = InferNamespace<TestMethods, 'boards'>

      expectTypeOf<Result>().toEqualTypeOf<{
        boards: {
          get: (
            params: { id: string },
            options?: CallOptions,
          ) => Promise<{ name: string }>
        }
      }>()
    })

    it('should handle multi-segment prefixes', () => {
      class TestMethods {
        async abort(
          _client: ClientNode,
          _params: { generationId: string },
        ): Promise<void> {
          return
        }
      }

      type Result = InferNamespace<TestMethods, 'ai.generation'>

      expectTypeOf<Result>().toEqualTypeOf<{
        ai: {
          generation: {
            abort: (
              params: { generationId: string },
              options?: CallOptions,
            ) => Promise<void>
          }
        }
      }>()
    })

    it('should exclude non-bifrost methods', () => {
      class TestMethods {
        async get(
          _client: ClientNode,
          _params: { id: string },
        ): Promise<string> {
          return 'ok'
        }
        helperMethod(): string {
          return 'not a bifrost method'
        }
      }

      type Result = InferNamespace<TestMethods, 'test'>

      expectTypeOf<Result>().toEqualTypeOf<{
        test: {
          get: (
            params: { id: string },
            options?: CallOptions,
          ) => Promise<string>
        }
      }>()
    })

    it('should intersect multiple namespaces correctly', () => {
      class MethodsA {
        async generate(
          _client: ClientNode,
          _params: { prompt: string },
        ): Promise<string> {
          return 'ok'
        }
      }

      class MethodsB {
        async dimensions(
          _client: ClientNode,
          _params: { svg: string },
        ): Promise<{ width: number }> {
          return { width: 0 }
        }
      }

      type Combined = InferNamespace<MethodsA, 'ai.mermaid'> &
        InferNamespace<MethodsB, 'ai.deck'>

      expectTypeOf<Combined['ai']['mermaid']['generate']>().toBeFunction()
      expectTypeOf<Combined['ai']['deck']['dimensions']>().toBeFunction()
    })
  })
})
