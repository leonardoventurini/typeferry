import { describe, expect, it } from 'vitest'

import { ClientEvents } from '../../utils'
import { TestUtility } from '../test-utility'

describe('WebSockets', () => {
  const test = new TestUtility()

  it('should close and reconnect', async () => {
    await test.client.close()

    expect(test.client.clientSocket.ready).to.be.false

    await test.client.connect()

    expect(test.client.clientSocket.ready).to.be.true
  })

  it('should attempt to reconnect, fail, and then succeed to connect manually', async () => {
    test.server.acceptConnections = false

    await test.client.close()

    expect(test.client.clientSocket.ready).to.be.false

    test.server.acceptConnections = true

    await test.client.connect()

    expect(test.client.clientSocket.ready).to.be.true
  })

  it('should call init even after it abnormally reconnects', async () => {
    setTimeout(() => {
      // Force-close the underlying WebSocket to simulate abnormal disconnect
      test.client.clientSocket.socket?.close()
    }, 0)

    await test.client.waitFor(ClientEvents.WEBSOCKET_CLOSED)

    await test.client.waitFor(ClientEvents.INITIALIZED, 10000)
  }, 20000)
})
