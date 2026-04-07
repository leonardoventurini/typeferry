import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Client } from './client'
import { ClientHttp } from './client-http'

// Mock global fetch
global.fetch = vi.fn() as unknown as typeof fetch

describe('ClientHttp', () => {
  let client: Partial<Client>
  let clientHttp: ClientHttp

  beforeEach(() => {
    client = {
      options: { host: 'localhost', secure: false },
      context: {},
      uuid: 'test-uuid',
      logger: { method: vi.fn() } as unknown as Client['logger'],
      emit: vi.fn(),
    }
    clientHttp = new ClientHttp(client as unknown as Client)
    vi.clearAllMocks()
  })

  it('should include credentials: "include" in fetch options', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('{}'),
    } as Response)

    await clientHttp.request(
      { foo: 'bar' },
      () => undefined,
      () => undefined,
    )

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/__h'),
      expect.objectContaining({
        credentials: 'include',
      }),
    )
  })
})
