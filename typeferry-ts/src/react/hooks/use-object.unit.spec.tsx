// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useLastChangedTimestamp, useObject } from './use-object'

describe('useLastChangedTimestamp', () => {
  it('returns an initial timestamp', () => {
    const { result } = renderHook(() => useLastChangedTimestamp({ a: 1 }))

    expect(typeof result.current).toBe('number')
    expect(result.current).toBeGreaterThan(0)
  })

  it('does not change timestamp when object is deeply equal', () => {
    const { result, rerender } = renderHook(
      ({ obj }) => useLastChangedTimestamp(obj),
      { initialProps: { obj: { a: 1 } } },
    )

    const first = result.current
    rerender({ obj: { a: 1 } })

    expect(result.current).toBe(first)
  })

  it('updates timestamp when object changes', async () => {
    const now = 1000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const { result, rerender } = renderHook(
      ({ obj }) => useLastChangedTimestamp(obj),
      { initialProps: { obj: { a: 1 } } },
    )

    const first = result.current
    expect(first).toBe(now)

    // Advance the mocked Date.now so the new timestamp differs
    vi.spyOn(Date, 'now').mockReturnValue(2000)

    act(() => {
      rerender({ obj: { a: 2 } })
    })

    expect(result.current).toBe(2000)
    expect(result.current).not.toBe(first)

    vi.restoreAllMocks()
  })
})

describe('useObject', () => {
  it('returns the same reference when object is deeply equal', () => {
    const { result, rerender } = renderHook(
      ({ obj }) => useObject(obj),
      { initialProps: { obj: { x: 1, y: 2 } } },
    )

    const firstRef = result.current

    rerender({ obj: { x: 1, y: 2 } })

    expect(result.current).toBe(firstRef)
  })

  it('returns a new reference when object changes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000)

    const { result, rerender } = renderHook(
      ({ obj }) => useObject(obj),
      { initialProps: { obj: { x: 1 } } },
    )

    const firstRef = result.current

    // Change Date.now so timestamp changes
    vi.spyOn(Date, 'now').mockReturnValue(2000)

    act(() => {
      rerender({ obj: { x: 2 } })
    })

    expect(result.current).toEqual({ x: 2 })
    expect(result.current).not.toBe(firstRef)

    vi.restoreAllMocks()
  })
})
