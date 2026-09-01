// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useMethodRefresh } from './use-method-refresh'

describe('useMethodRefresh', () => {
  function createArgs(overrides = {}) {
    return {
      authenticated: false,
      caller: {
        call: vi.fn().mockResolvedValue('result-data'),
      },
      client: {
        authenticated: true,
      },
      params: { id: '1' },
      method: 'test.method',
      setError: vi.fn(),
      setLoading: vi.fn(),
      setResult: vi.fn(),
      shouldCall: true,
      startLoading: Object.assign(vi.fn(), { cancel: vi.fn() }),
      methodOptions: {},
      defaultValue: null,
      deps: [],
      ...overrides,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns undefined when method is falsy', () => {
    const args = createArgs({ method: null })
    const { result } = renderHook(() => useMethodRefresh(args))

    const returnValue = result.current()
    expect(returnValue).toBeUndefined()
    expect(args.caller.call).not.toHaveBeenCalled()
  })

  it('returns undefined when method is empty string', () => {
    const args = createArgs({ method: '' })
    const { result } = renderHook(() => useMethodRefresh(args))

    const returnValue = result.current()
    expect(returnValue).toBeUndefined()
    expect(args.caller.call).not.toHaveBeenCalled()
  })

  it('returns undefined when shouldCall is false', () => {
    const args = createArgs({ shouldCall: false })
    const { result } = renderHook(() => useMethodRefresh(args))

    const returnValue = result.current()
    expect(returnValue).toBeUndefined()
    expect(args.caller.call).not.toHaveBeenCalled()
  })

  it('returns undefined when caller is falsy', () => {
    const args = createArgs({ caller: null })
    const { result } = renderHook(() => useMethodRefresh(args))

    const returnValue = result.current()
    expect(returnValue).toBeUndefined()
  })

  it('skips call when authenticated required but client.authenticated is false', () => {
    const args = createArgs({
      authenticated: true,
      client: { authenticated: false },
      defaultValue: 'default-val',
    })
    const { result } = renderHook(() => useMethodRefresh(args))

    result.current()

    expect(args.setLoading).toHaveBeenCalledWith(false)
    expect(args.setResult).toHaveBeenCalledWith('default-val')
    expect(args.caller.call).not.toHaveBeenCalled()
  })

  it('does not skip call when authenticated is false (public method)', async () => {
    const args = createArgs({
      authenticated: false,
      client: { authenticated: false },
    })
    const { result } = renderHook(() => useMethodRefresh(args))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(args.caller.call).toHaveBeenCalled()
  })

  it('sets result and clears error on successful call', async () => {
    const args = createArgs()
    args.caller.call.mockResolvedValue('success-data')

    const { result } = renderHook(() => useMethodRefresh(args))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(args.caller.call).toHaveBeenCalledWith(
      args.client,
      'test.method',
      args.params,
      args.methodOptions,
    )
    expect(args.setResult).toHaveBeenCalledWith('success-data')
    expect(args.setError).toHaveBeenCalledWith(undefined)
  })

  it('sets error and clears result on failed call', async () => {
    const error = new Error('call failed')
    const args = createArgs()
    args.caller.call.mockRejectedValue(error)

    const { result } = renderHook(() => useMethodRefresh(args))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(args.setError).toHaveBeenCalledWith(error)
    expect(args.setResult).toHaveBeenCalledWith(undefined)
  })

  it('calls startLoading.cancel and setLoading(false) on completion', async () => {
    const args = createArgs()

    const { result } = renderHook(() => useMethodRefresh(args))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(args.startLoading.cancel).toHaveBeenCalled()
    expect(args.setLoading).toHaveBeenCalledWith(false)
  })

  it('calls startLoading.cancel and setLoading(false) even on failure', async () => {
    const args = createArgs()
    args.caller.call.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useMethodRefresh(args))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(args.startLoading.cancel).toHaveBeenCalled()
    expect(args.setLoading).toHaveBeenCalledWith(false)
  })

  it('calls callback after successful completion', async () => {
    const args = createArgs()
    const callback = vi.fn()

    const { result } = renderHook(() => useMethodRefresh(args))

    await act(async () => {
      result.current(callback)
      await Promise.resolve()
    })

    expect(callback).toHaveBeenCalled()
  })

  it('calls callback after failed completion', async () => {
    const args = createArgs()
    args.caller.call.mockRejectedValue(new Error('fail'))
    const callback = vi.fn()

    const { result } = renderHook(() => useMethodRefresh(args))

    await act(async () => {
      result.current(callback)
      await Promise.resolve()
    })

    expect(callback).toHaveBeenCalled()
  })

  it('calls startLoading before the async call', async () => {
    let startLoadingOrder = -1
    let callOrder = -1
    let order = 0

    const args = createArgs()
    args.startLoading.mockImplementation(() => {
      startLoadingOrder = order++
    })
    args.caller.call.mockImplementation(() => {
      callOrder = order++
      return Promise.resolve('data')
    })

    const { result } = renderHook(() => useMethodRefresh(args))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(startLoadingOrder).toBeLessThan(callOrder)
  })

  it('does not call callback if callback is not a function', async () => {
    const args = createArgs()
    const { result } = renderHook(() => useMethodRefresh(args))

    // Should not throw when callback is not a function
    await act(async () => {
      result.current('not-a-function')
      await Promise.resolve()
    })

    expect(args.setResult).toHaveBeenCalledWith('result-data')
  })
})
