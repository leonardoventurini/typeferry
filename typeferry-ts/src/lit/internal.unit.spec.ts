// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { requireClient, resolveClient } from './internal'

describe('lit internal helpers', () => {
  it('resolves direct clients, providers, and getter functions', () => {
    const client = { call: vi.fn(), channel: vi.fn() } as any
    const provider = { client }
    const getter = () => provider

    expect(resolveClient(client)).toBe(client)
    expect(resolveClient(provider)).toBe(client)
    expect(resolveClient(getter as any)).toBe(client)
  })

  it('returns null for empty sources', () => {
    expect(resolveClient(null)).toBeNull()
    expect(resolveClient(undefined)).toBeNull()
  })

  it('throws when a client is required but missing', () => {
    expect(() => requireClient(null)).toThrow('Client Not Found')
  })
})
