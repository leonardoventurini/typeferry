import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventEmitter2 from '../../utils/event-emitter'

type MockClient = EventEmitter2 & { channel: (name: string) => EventEmitter2 }

/** Creates a minimal mock emitter with channel isolation. */
function createMockClient(): MockClient {
  const emitter = new EventEmitter2() as MockClient
  const channels = new Map<string, EventEmitter2>()
  emitter.channel = (name: string) => {
    if (!channels.has(name)) channels.set(name, new EventEmitter2())
    return channels.get(name) as EventEmitter2
  }
  return emitter
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockClientRef: { current: any } = { current: null }

vi.mock('./use-client', () => ({
  useClient: () => mockClientRef.current,
}))

import { NO_CHANNEL } from '../../utils'
import { useLocalEvent } from './use-local-event'

/** Helper to get the mock client with proper typing. */
function client(): MockClient {
  return mockClientRef.current as MockClient
}

/** Default channel emitter — NO_CHANNEL routes through client.channel(). */
function defaultEmitter(): EventEmitter2 {
  return client().channel(NO_CHANNEL)
}

describe('useLocalEvent', () => {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <>{children}</>
  )

  beforeEach(() => {
    mockClientRef.current = createMockClient()
  })

  afterEach(() => {
    client().removeAllListeners()
  })

  it('subscribes via string param and fires callback', () => {
    const callback = vi.fn()
    renderHook(() => useLocalEvent('test:event', callback), { wrapper })

    defaultEmitter().emit('test:event', 'payload')
    expect(callback).toHaveBeenCalledWith('payload')
  })

  it('subscribes via object param and fires callback', () => {
    const callback = vi.fn()
    renderHook(() => useLocalEvent({ event: 'obj:event' }, callback), {
      wrapper,
    })

    defaultEmitter().emit('obj:event', 42)
    expect(callback).toHaveBeenCalledWith(42)
  })

  it('subscribes on a named channel', () => {
    const callback = vi.fn()
    renderHook(
      () =>
        useLocalEvent({ event: 'ch:event', channel: 'my-channel' }, callback),
      { wrapper },
    )

    client().emit('ch:event', 'root')
    expect(callback).not.toHaveBeenCalled()

    client().channel('my-channel').emit('ch:event', 'channel')
    expect(callback).toHaveBeenCalledWith('channel')
  })

  it('does NOT subscribe when active is false', () => {
    const callback = vi.fn()
    renderHook(
      () => useLocalEvent({ event: 'no:sub', active: false }, callback),
      { wrapper },
    )

    defaultEmitter().emit('no:sub', 'ignored')
    expect(callback).not.toHaveBeenCalled()
  })

  it('toggles subscription when active changes', () => {
    const callback = vi.fn()
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useLocalEvent({ event: 'toggle:event', active }, callback),
      { wrapper, initialProps: { active: false } },
    )

    defaultEmitter().emit('toggle:event', 'while-inactive')
    expect(callback).not.toHaveBeenCalled()

    rerender({ active: true })
    defaultEmitter().emit('toggle:event', 'while-active')
    expect(callback).toHaveBeenCalledWith('while-active')

    rerender({ active: false })
    defaultEmitter().emit('toggle:event', 'after-deactivate')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('removes listener on unmount', () => {
    const callback = vi.fn()
    const { unmount } = renderHook(
      () => useLocalEvent('cleanup:event', callback),
      { wrapper },
    )

    unmount()
    defaultEmitter().emit('cleanup:event', 'after-unmount')
    expect(callback).not.toHaveBeenCalled()
  })

  it('swaps listener when event name changes', () => {
    const callback = vi.fn()
    const { rerender } = renderHook(
      ({ event }: { event: string }) => useLocalEvent(event, callback),
      { wrapper, initialProps: { event: 'old:event' } },
    )

    rerender({ event: 'new:event' })

    defaultEmitter().emit('old:event', 'stale')
    expect(callback).not.toHaveBeenCalled()

    defaultEmitter().emit('new:event', 'fresh')
    expect(callback).toHaveBeenCalledWith('fresh')
  })

  it('refreshes callback when deps change', () => {
    let captured = 'initial'
    const { rerender } = renderHook(
      ({ value }: { value: string }) =>
        useLocalEvent(
          'dep:event',
          () => {
            captured = value
          },
          [value],
        ),
      { wrapper, initialProps: { value: 'initial' } },
    )

    rerender({ value: 'updated' })
    act(() => {
      defaultEmitter().emit('dep:event')
    })
    expect(captured).toBe('updated')
  })
})
