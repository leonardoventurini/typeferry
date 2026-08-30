import { describe, expect, it, vi } from 'vitest'

import { configureStaticClient } from '@/server/static-client'

describe('configureStaticClient', () => {
  it('validates the entry before mounting the SPA fallback', async () => {
    const calls: string[] = []
    const server = {
      static(path: string, catchAll: boolean): void {
        calls.push(`static:${path}:${String(catchAll)}`)
      },
    }
    const assertReadable = vi.fn(async (path: string): Promise<void> => {
      calls.push(`access:${path}`)
    })

    await configureStaticClient(server, '/app/dist/client', assertReadable)

    expect(calls).toEqual([
      'access:/app/dist/client/index.html',
      'static:/app/dist/client:true',
    ])
  })

  it('does not mount static routing when the client build is absent', async () => {
    const server = { static: vi.fn() }
    const assertReadable = vi.fn(() =>
      Promise.reject(new Error('missing client build')),
    )

    await expect(
      configureStaticClient(server, '/app/dist/client', assertReadable),
    ).rejects.toThrow('missing client build')
    expect(server.static).not.toHaveBeenCalled()
  })
})
