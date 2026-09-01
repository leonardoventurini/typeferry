// @vitest-environment jsdom
import { render, renderHook } from '@testing-library/react'
import React, { useContext } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseCreation = vi.hoisted(() => {
  let returnValue: any = undefined
  const fn = vi.fn((factory: () => any) => {
    if (returnValue !== undefined) return returnValue
    return factory()
  })
  return Object.assign(fn, {
    setReturnValue: (v: any) => { returnValue = v },
    reset: () => { returnValue = undefined },
  })
})

vi.mock('../hooks/use-creation', () => ({
  useCreation: mockUseCreation,
}))

vi.mock('../../client', () => ({
  Client: class MockClient {
    close = vi.fn()
  },
}))

import { ClientContext, ClientProvider } from './client-provider'

describe('ClientProvider', () => {
  beforeEach(() => {
    mockUseCreation.reset()
  })

  afterEach(() => {
    mockUseCreation.reset()
  })

  it('renders children when clientInstance is provided', () => {
    const fakeClient = { close: vi.fn() } as any

    const { getByText } = render(
      <ClientProvider clientInstance={fakeClient}>
        <div>child content</div>
      </ClientProvider>,
    )

    expect(getByText('child content')).toBeTruthy()
  })

  it('provides client via context', () => {
    const fakeClient = { close: vi.fn() } as any

    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <ClientProvider clientInstance={fakeClient}>{children}</ClientProvider>
    )

    const { result } = renderHook(() => useContext(ClientContext), { wrapper })

    expect(result.current).toBe(fakeClient)
  })

  it('calls client.close on unmount', () => {
    const fakeClient = { close: vi.fn() } as any

    const { unmount } = render(
      <ClientProvider clientInstance={fakeClient}>
        <div>child</div>
      </ClientProvider>,
    )

    expect(fakeClient.close).not.toHaveBeenCalled()

    unmount()

    expect(fakeClient.close).toHaveBeenCalledTimes(1)
  })

  it('does not render children when client is null/falsy', () => {
    mockUseCreation.setReturnValue(null)

    const { container } = render(
      <ClientProvider clientInstance={null as any}>
        <div>should not appear</div>
      </ClientProvider>,
    )

    expect(container.textContent).toBe('')
  })
})
