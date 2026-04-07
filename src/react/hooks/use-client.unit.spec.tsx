// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockEnvironment = vi.hoisted(() => ({
  isServer: false,
  canUseDOM: true,
}))

vi.mock('../../utils', () => ({
  Environment: mockEnvironment,
}))

vi.mock('../components', () => ({
  ClientContext: React.createContext(undefined),
}))

import { ClientContext } from '../components'
import { useClient } from './use-client'

describe('useClient', () => {
  afterEach(() => {
    mockEnvironment.isServer = false
  })

  it('returns client from context', () => {
    const fakeClient = { call: vi.fn() }

    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <ClientContext.Provider value={fakeClient}>
        {children}
      </ClientContext.Provider>
    )

    const { result } = renderHook(() => useClient(), { wrapper })

    expect(result.current).toBe(fakeClient)
  })

  it('throws when no client in context', () => {
    expect(() => {
      renderHook(() => useClient())
    }).toThrow('Client Not Found')
  })

  it('returns null on server (Environment.isServer = true)', () => {
    mockEnvironment.isServer = true

    const { result } = renderHook(() => useClient())

    expect(result.current).toBeNull()
  })
})
