// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../client', () => ({
  Client: class MockClient {
    static instances: any[] = []

    close = vi.fn().mockResolvedValue(undefined)
    options: any

    constructor(options: any = {}) {
      this.options = options
      ;(this.constructor as typeof MockClient).instances.push(this)
    }
  },
}))

import { Client as MockClient } from '../client'
import { TypeFerryClientController } from './client-controller'

const MockClientState = MockClient as any

describe('TypeFerryClientController', () => {
  beforeEach(() => {
    MockClientState.instances.length = 0
  })

  it('creates a client from options and closes it on disconnect', () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any

    const controller = new TypeFerryClientController(host, {
      clientOptions: { host: 'example.com', port: 1234 },
    })

    controller.hostConnected()

    expect(MockClientState.instances).toHaveLength(1)
    expect(controller.client).toBe(MockClientState.instances[0])
    expect(MockClientState.instances[0].options).toEqual({
      host: 'example.com',
      port: 1234,
    })

    const client = controller.client as any
    controller.hostDisconnected()

    expect(client.close).toHaveBeenCalledTimes(1)
  })

  it('uses an injected client without closing it', () => {
    const host = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
    } as any
    const externalClient = {
      close: vi.fn(),
      call: vi.fn(),
      channel: vi.fn(),
    } as any

    const controller = new TypeFerryClientController(host, {
      client: { client: externalClient },
    })

    controller.hostConnected()

    expect(controller.client).toBe(externalClient)

    controller.hostDisconnected()

    expect(externalClient.close).not.toHaveBeenCalled()
  })
})
