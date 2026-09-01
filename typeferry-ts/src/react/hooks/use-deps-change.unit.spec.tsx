// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDepsChange } from './use-deps-change'

describe('useDepsChange', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    debugSpy.mockRestore()
  })

  it('logs all deps as changed on initial render', () => {
    renderHook(() => useDepsChange(['a', 'b']))

    expect(debugSpy).toHaveBeenCalledTimes(2)
    expect(debugSpy).toHaveBeenCalledWith(
      'Dep Changed',
      0,
      { prev: undefined },
      { next: 'a' },
      {},
    )
    expect(debugSpy).toHaveBeenCalledWith(
      'Dep Changed',
      1,
      { prev: undefined },
      { next: 'b' },
      {},
    )
  })

  it('does not log when deps are the same on rerender', () => {
    const { rerender } = renderHook(
      ({ deps }) => useDepsChange(deps),
      { initialProps: { deps: ['a', 'b'] } },
    )

    debugSpy.mockClear()
    rerender({ deps: ['a', 'b'] })

    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('logs only the changed dep on rerender', () => {
    const { rerender } = renderHook(
      ({ deps }) => useDepsChange(deps),
      { initialProps: { deps: ['a', 'b'] } },
    )

    debugSpy.mockClear()
    rerender({ deps: ['a', 'c'] })

    expect(debugSpy).toHaveBeenCalledTimes(1)
    expect(debugSpy).toHaveBeenCalledWith(
      'Dep Changed',
      1,
      { prev: 'b' },
      { next: 'c' },
      {},
    )
  })

  it('passes custom data object through to console.debug', () => {
    const customData = { label: 'my-hook' }

    renderHook(() => useDepsChange(['x'], customData))

    expect(debugSpy).toHaveBeenCalledWith(
      'Dep Changed',
      0,
      { prev: undefined },
      { next: 'x' },
      customData,
    )
  })
})
