// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useCircuitBreaker } from './use-circuit-breaker'

describe('useCircuitBreaker', () => {
  it('returns shouldCall=true when no parse and no required', () => {
    const { result } = renderHook(() =>
      useCircuitBreaker({ parse: undefined, params: {}, required: [], deps: [] }),
    )

    expect(result.current).toEqual({ shouldCall: true })
  })

  it('returns shouldCall=false with placeholderValue when parse returns a value', () => {
    const parse = () => 'placeholder'

    const { result } = renderHook(() =>
      useCircuitBreaker({ parse, params: {}, required: [], deps: [] }),
    )

    expect(result.current).toEqual({
      shouldCall: false,
      placeholderValue: 'placeholder',
    })
  })

  it('returns shouldCall=true when parse returns undefined', () => {
    const parse = () => undefined

    const { result } = renderHook(() =>
      useCircuitBreaker({ parse, params: { id: '1' }, required: [], deps: [] }),
    )

    expect(result.current).toEqual({ shouldCall: true })
  })

  it('returns shouldCall=true when all required params are present', () => {
    const { result } = renderHook(() =>
      useCircuitBreaker({
        parse: undefined,
        params: { id: '1', name: 'test' },
        required: ['id', 'name'],
        deps: [],
      }),
    )

    expect(result.current).toEqual({ shouldCall: true })
  })

  it('returns shouldCall=false when required params are missing', () => {
    const { result } = renderHook(() =>
      useCircuitBreaker({
        parse: undefined,
        params: { id: '1' },
        required: ['id', 'name'],
        deps: [],
      }),
    )

    expect(result.current).toEqual({
      shouldCall: false,
      placeholderValue: undefined,
    })
  })

  it('returns shouldCall=true when required is an empty array', () => {
    const { result } = renderHook(() =>
      useCircuitBreaker({
        parse: undefined,
        params: {},
        required: [],
        deps: [],
      }),
    )

    expect(result.current).toEqual({ shouldCall: true })
  })

  it('returns shouldCall=false when parse returns a value AND required params are missing', () => {
    const parse = () => 'fallback'

    const { result } = renderHook(() =>
      useCircuitBreaker({
        parse,
        params: {},
        required: ['id'],
        deps: [],
      }),
    )

    expect(result.current).toEqual({
      shouldCall: false,
      placeholderValue: 'fallback',
    })
  })

  it('treats null params as missing required keys', () => {
    const { result } = renderHook(() =>
      useCircuitBreaker({
        parse: undefined,
        params: { id: null },
        required: ['id'],
        deps: [],
      }),
    )

    expect(result.current).toEqual({
      shouldCall: false,
      placeholderValue: undefined,
    })
  })
})
