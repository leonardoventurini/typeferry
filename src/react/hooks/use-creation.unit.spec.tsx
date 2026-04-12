// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useCreation } from './use-creation'

describe('useCreation', () => {
  it('reuses the cached value while deps are stable', () => {
    const factory = vi.fn(() => ({ id: 1 }))
    const { result, rerender } = renderHook(
      ({ dep }) => useCreation(factory, [dep]),
      { initialProps: { dep: 'same' } },
    )

    const initialValue = result.current

    rerender({ dep: 'same' })

    expect(result.current).toBe(initialValue)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('recreates the value when a dependency changes', () => {
    const factory = vi
      .fn<() => { id: number }>()
      .mockReturnValueOnce({ id: 1 })
      .mockReturnValueOnce({ id: 2 })
    const { result, rerender } = renderHook(
      ({ dep }) => useCreation(factory, [dep]),
      { initialProps: { dep: 'first' } },
    )

    const initialValue = result.current

    rerender({ dep: 'second' })

    expect(result.current).not.toBe(initialValue)
    expect(result.current).toEqual({ id: 2 })
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
