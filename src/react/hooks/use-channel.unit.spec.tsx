// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NO_CHANNEL } from '../../utils'

const mockClientRef: { current: any } = { current: null }

vi.mock('./use-client', () => ({
  useClient: () => mockClientRef.current,
}))

import { useChannel } from './use-channel'

describe('useChannel', () => {
  it('uses NO_CHANNEL when no channel argument is provided', () => {
    const mockChannel = { name: NO_CHANNEL }
    mockClientRef.current = {
      channel: vi.fn().mockReturnValue(mockChannel),
    }

    const { result } = renderHook(() => useChannel())

    expect(mockClientRef.current.channel).toHaveBeenCalledWith(NO_CHANNEL)
    expect(result.current).toBe(mockChannel)
  })

  it('passes a custom channel name through to client.channel()', () => {
    const mockChannel = { name: 'my-room' }
    mockClientRef.current = {
      channel: vi.fn().mockReturnValue(mockChannel),
    }

    const { result } = renderHook(() => useChannel('my-room'))

    expect(mockClientRef.current.channel).toHaveBeenCalledWith('my-room')
    expect(result.current).toBe(mockChannel)
  })

  it('returns the value from client.channel()', () => {
    const channelObj = { emit: vi.fn(), on: vi.fn() }
    mockClientRef.current = {
      channel: vi.fn().mockReturnValue(channelObj),
    }

    const { result } = renderHook(() => useChannel('test'))

    expect(result.current).toBe(channelObj)
  })
})
