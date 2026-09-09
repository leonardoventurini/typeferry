// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  useMethodRefresh,
  type UseMethodRefreshOptions,
} from './use-method-refresh'
import type { MethodCaller } from './use-caller'

describe('useMethodRefresh', () => {
  function createArgs(
    overrides: Partial<UseMethodRefreshOptions> = {},
  ) {
    const caller = vi.fn<MethodCaller>().mockResolvedValue('result-data')
    const options: UseMethodRefreshOptions = {
      authenticated: false,
      caller,
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

    return { caller, options }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns undefined when method is falsy', () => {
    const { caller, options } = createArgs({ method: null })
    const { result } = renderHook(() => useMethodRefresh(options))

    const returnValue = result.current()
    expect(returnValue).toBeUndefined()
    expect(caller).not.toHaveBeenCalled()
  })

  it('returns undefined when method is empty string', () => {
    const { caller, options } = createArgs({ method: '' })
    const { result } = renderHook(() => useMethodRefresh(options))

    const returnValue = result.current()
    expect(returnValue).toBeUndefined()
    expect(caller).not.toHaveBeenCalled()
  })

  it('returns undefined when shouldCall is false', () => {
    const { caller, options } = createArgs({ shouldCall: false })
    const { result } = renderHook(() => useMethodRefresh(options))

    const returnValue = result.current()
    expect(returnValue).toBeUndefined()
    expect(caller).not.toHaveBeenCalled()
  })

  it('returns undefined when caller is falsy', () => {
    const { options } = createArgs({ caller: null })
    const { result } = renderHook(() => useMethodRefresh(options))

    const returnValue = result.current()
    expect(returnValue).toBeUndefined()
  })

  it('skips call when authenticated required but client.authenticated is false', () => {
    const { caller, options } = createArgs({
      authenticated: true,
      client: { authenticated: false },
      defaultValue: 'default-val',
    })
    const { result } = renderHook(() => useMethodRefresh(options))

    result.current()

    expect(options.setLoading).toHaveBeenCalledWith(false)
    expect(options.setResult).toHaveBeenCalledWith('default-val')
    expect(caller).not.toHaveBeenCalled()
  })

  it('does not skip call when authenticated is false (public method)', async () => {
    const { caller, options } = createArgs({
      authenticated: false,
      client: { authenticated: false },
    })
    const { result } = renderHook(() => useMethodRefresh(options))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(caller).toHaveBeenCalled()
  })

  it('sets result and clears error on successful call', async () => {
    const { caller, options } = createArgs()
    caller.mockResolvedValue('success-data')

    const { result } = renderHook(() => useMethodRefresh(options))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(caller).toHaveBeenCalledWith(
      'test.method',
      options.params,
      options.methodOptions,
    )
    expect(options.setResult).toHaveBeenCalledWith('success-data')
    expect(options.setError).toHaveBeenCalledWith(undefined)
  })

  it('sets error and clears result on failed call', async () => {
    const error = new Error('call failed')
    const { caller, options } = createArgs()
    caller.mockRejectedValue(error)

    const { result } = renderHook(() => useMethodRefresh(options))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(options.setError).toHaveBeenCalledWith(error)
    expect(options.setResult).toHaveBeenCalledWith(undefined)
  })

  it('calls startLoading.cancel and setLoading(false) on completion', async () => {
    const { options } = createArgs()

    const { result } = renderHook(() => useMethodRefresh(options))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(options.startLoading.cancel).toHaveBeenCalled()
    expect(options.setLoading).toHaveBeenCalledWith(false)
  })

  it('calls startLoading.cancel and setLoading(false) even on failure', async () => {
    const { caller, options } = createArgs()
    caller.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useMethodRefresh(options))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(options.startLoading.cancel).toHaveBeenCalled()
    expect(options.setLoading).toHaveBeenCalledWith(false)
  })

  it('calls callback after successful completion', async () => {
    const { options } = createArgs()
    const callback = vi.fn()

    const { result } = renderHook(() => useMethodRefresh(options))

    await act(async () => {
      result.current(callback)
      await Promise.resolve()
    })

    expect(callback).toHaveBeenCalled()
  })

  it('calls callback after failed completion', async () => {
    const { caller, options } = createArgs()
    caller.mockRejectedValue(new Error('fail'))
    const callback = vi.fn()

    const { result } = renderHook(() => useMethodRefresh(options))

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

    const { caller, options } = createArgs()
    vi.mocked(options.startLoading).mockImplementation(() => {
      startLoadingOrder = order++
    })
    caller.mockImplementation(() => {
      callOrder = order++
      return Promise.resolve('data')
    })

    const { result } = renderHook(() => useMethodRefresh(options))

    await act(async () => {
      result.current()
      await Promise.resolve()
    })

    expect(startLoadingOrder).toBeLessThan(callOrder)
  })

  it('does not call callback if callback is not a function', async () => {
    const { options } = createArgs()
    const { result } = renderHook(() => useMethodRefresh(options))

    // Should not throw when callback is not a function
    await act(async () => {
      Reflect.apply(result.current, undefined, ['not-a-function'])
      await Promise.resolve()
    })

    expect(options.setResult).toHaveBeenCalledWith('result-data')
  })
})
