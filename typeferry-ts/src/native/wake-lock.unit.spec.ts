import { beforeEach, describe, expect, it, vi } from 'vitest'
const bridge = vi.hoisted(() => ({ acquireWakeLock: vi.fn(), releaseWakeLock: vi.fn() }))
vi.mock('@capacitor/core', () => ({ registerPlugin: () => bridge }))
import { acquireNativeWakeLock } from './wake-lock'

beforeEach(() => {
  vi.resetAllMocks()
  bridge.acquireWakeLock.mockResolvedValue({ id: 'lease-id' })
  bridge.releaseWakeLock.mockResolvedValue(undefined)
})

describe('native wake lock lease', () => {
  it('releases each acquired lease once even with repeated cleanup', async () => {
    const lease = await acquireNativeWakeLock()
    await Promise.all([lease.release(), lease.release()])
    expect(bridge.releaseWakeLock).toHaveBeenCalledTimes(1)
    expect(bridge.releaseWakeLock).toHaveBeenCalledWith({ id: 'lease-id' })
  })

  it('does not create a lease when native acquisition fails', async () => {
    bridge.acquireWakeLock.mockRejectedValue(new Error('Unavailable'))
    await expect(acquireNativeWakeLock()).rejects.toThrow('Unavailable')
    expect(bridge.releaseWakeLock).not.toHaveBeenCalled()
  })
})
