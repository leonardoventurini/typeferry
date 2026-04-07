import { describe, expect, it, vi } from 'vitest'

import { callMethodProxy } from '../../client/call-method-proxy'
import type { Client } from '../../client/client'

/** Creates a minimal Client stub with a spy on `call`. */
function createMockClient(): Client & { call: ReturnType<typeof vi.fn> } {
  return { call: vi.fn().mockResolvedValue('ok') } as unknown as Client & {
    call: ReturnType<typeof vi.fn>
  }
}

describe('callMethodProxy', () => {
  it('should build single-segment path', async () => {
    const client = createMockClient()
    const proxy = callMethodProxy(client)

    await proxy.boards({ id: '1' })

    expect(client.call).toHaveBeenCalledWith('boards', { id: '1' })
  })

  it('should build multi-segment dotted path', async () => {
    const client = createMockClient()
    const proxy = callMethodProxy(client)

    await proxy.ai.generation.abort({ generationId: 'g1' })

    expect(client.call).toHaveBeenCalledWith('ai.generation.abort', {
      generationId: 'g1',
    })
  })

  it('should forward options as second argument', async () => {
    const client = createMockClient()
    const proxy = callMethodProxy(client)

    await proxy.ai.mermaid.generate({ prompt: 'test' }, { timeout: 300000 })

    expect(client.call).toHaveBeenCalledWith(
      'ai.mermaid.generate',
      { prompt: 'test' },
      { timeout: 300000 },
    )
  })

  it('should return undefined for Symbol property access', () => {
    const client = createMockClient()
    const proxy = callMethodProxy(client) as unknown as Record<symbol, unknown>

    expect(proxy[Symbol.toPrimitive]).toBeUndefined()
    expect(proxy[Symbol.iterator]).toBeUndefined()
    expect(proxy[Symbol.toStringTag]).toBeUndefined()
  })

  it('should not throw when accessing nested Symbol properties', () => {
    const client = createMockClient()
    const proxy = callMethodProxy(client)
    const nested = proxy.ai as unknown as Record<symbol, unknown>
    const deep = proxy.ai.generation as unknown as Record<symbol, unknown>

    expect(() => nested[Symbol.toPrimitive]).not.toThrow()
    expect(deep[Symbol.iterator]).toBeUndefined()
  })

  it('should handle call with no params', async () => {
    const client = createMockClient()
    const proxy = callMethodProxy(client)

    await proxy.status()

    expect(client.call).toHaveBeenCalledWith('status')
  })

  it('should return the resolved value from client.call', async () => {
    const client = createMockClient()
    client.call.mockResolvedValue({ width: 100 })
    const proxy = callMethodProxy(client)

    const result = await proxy.ai.mermaid.dimensions({ svg: '<svg/>' })

    expect(result).toEqual({ width: 100 })
  })

  describe('primitive coercion', () => {
    it('should not throw on string concatenation', () => {
      const client = createMockClient()
      const proxy = callMethodProxy(client)

      expect(() => `${proxy.boards}`).not.toThrow()
      expect(`${proxy.boards}`).toBe('boards')
    })

    it('should return the dotted path from toString', () => {
      const client = createMockClient()
      const proxy = callMethodProxy(client)

      expect(proxy.ai.generation.abort.toString()).toBe('ai.generation.abort')
    })

    it('should return the path from valueOf', () => {
      const client = createMockClient()
      const proxy = callMethodProxy(client)

      expect(proxy.boards.valueOf()).toBe('boards')
    })

    it('should serialize to path via toJSON', () => {
      const client = createMockClient()
      const proxy = callMethodProxy(client)

      expect(JSON.stringify({ method: proxy.nodes.update })).toBe(
        '{"method":"nodes.update"}',
      )
    })

    it('should return empty string for root proxy coercion', () => {
      const client = createMockClient()
      const proxy = callMethodProxy(client)

      expect(proxy.toString()).toBe('')
    })
  })
})
