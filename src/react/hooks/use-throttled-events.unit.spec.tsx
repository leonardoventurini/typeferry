// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockCleanup = vi.fn()
  const mockOnAllThrottled = vi.fn().mockReturnValue(mockCleanup)
  return { mockCleanup, mockOnAllThrottled }
})

vi.mock('../../utils', () => ({
  onAllThrottled: mocks.mockOnAllThrottled,
}))

import { useThrottledEvents } from './use-throttled-events'

describe('useThrottledEvents', () => {
  it('calls onAllThrottled with correct args on mount', () => {
    const emitter = { on: vi.fn(), off: vi.fn() } as any
    const events = ['event1', 'event2']
    const callback = vi.fn()

    renderHook(() => useThrottledEvents(emitter, events, callback, [], 500))

    expect(mocks.mockOnAllThrottled).toHaveBeenCalledTimes(1)
    expect(mocks.mockOnAllThrottled).toHaveBeenCalledWith(
      emitter,
      events,
      callback,
      500,
      undefined,
    )
  })

  it('calls cleanup on unmount', () => {
    const emitter = { on: vi.fn(), off: vi.fn() } as any
    const callback = vi.fn()

    mocks.mockCleanup.mockClear()
    mocks.mockOnAllThrottled.mockClear()
    mocks.mockOnAllThrottled.mockReturnValue(mocks.mockCleanup)

    const { unmount } = renderHook(() =>
      useThrottledEvents(emitter, ['ev'], callback),
    )

    expect(mocks.mockCleanup).not.toHaveBeenCalled()

    unmount()

    expect(mocks.mockCleanup).toHaveBeenCalledTimes(1)
  })

  it('re-registers when emitter changes', () => {
    const emitter1 = { on: vi.fn(), off: vi.fn() } as any
    const emitter2 = { on: vi.fn(), off: vi.fn() } as any
    const callback = vi.fn()

    mocks.mockOnAllThrottled.mockClear()
    mocks.mockCleanup.mockClear()

    const cleanup1 = vi.fn()
    const cleanup2 = vi.fn()
    mocks.mockOnAllThrottled
      .mockReturnValueOnce(cleanup1)
      .mockReturnValueOnce(cleanup2)

    const { rerender } = renderHook(
      ({ emitter }) => useThrottledEvents(emitter, ['ev'], callback),
      { initialProps: { emitter: emitter1 } },
    )

    expect(mocks.mockOnAllThrottled).toHaveBeenCalledTimes(1)
    expect(mocks.mockOnAllThrottled.mock.calls[0][0]).toBe(emitter1)

    rerender({ emitter: emitter2 })

    // Previous cleanup should be called, new registration should happen
    expect(cleanup1).toHaveBeenCalledTimes(1)
    expect(mocks.mockOnAllThrottled).toHaveBeenCalledTimes(2)
    expect(mocks.mockOnAllThrottled.mock.calls[1][0]).toBe(emitter2)
  })
})
