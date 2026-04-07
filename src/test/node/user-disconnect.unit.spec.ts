import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientNode } from '../../server'
import { ServerEvents } from '../../utils'
import { TestUtility } from '../test-utility'

/** Retrieves a ClientNode by uuid, failing the test if not found */
function getNode(test: TestUtility, uuid: string): ClientNode {
  const node = test.server.allClients.get(uuid)
  expect(node).toBeDefined()
  return node as ClientNode
}

describe('User Disconnect — userId Index', () => {
  const test = new TestUtility()

  beforeEach(async () => {
    test.server.setAuth({
      auth(context: Record<string, unknown>) {
        return context?.token === 'test'
          ? { ...context, user: { _id: context.userId ?? 'user-1' } }
          : false
      },
      async logIn({ email, password }) {
        if (email === 'test@bifrost.test' && password === '123456') {
          return { token: 'test' }
        }
      },
    })
  })

  it('returns empty set for unknown userId', () => {
    const result = test.server.getClientsByUserId('unknown')
    expect(result.size).toBe(0)
  })

  it('returns correct nodes after authentication', async () => {
    const client = await test.createAuthenticatedClient()
    const node = getNode(test, client.uuid)

    const nodes = test.server.getClientsByUserId('user-1')
    expect(nodes.size).toBe(1)
    expect(nodes.has(node)).toBe(true)
  })

  it('tracks multiple connections for same userId', async () => {
    await test.createAuthenticatedClient()
    await test.createAuthenticatedClient()

    const nodes = test.server.getClientsByUserId('user-1')
    expect(nodes.size).toBe(2)
  })

  it('removes node from userId index on deleteClient', async () => {
    const client = await test.createAuthenticatedClient()
    const node = getNode(test, client.uuid)

    expect(test.server.getClientsByUserId('user-1').size).toBe(1)

    test.server.deleteClient(node)

    expect(test.server.getClientsByUserId('user-1').size).toBe(0)
  })

  it('cleans up userId key when last node disconnects', async () => {
    const client1 = await test.createAuthenticatedClient()
    const client2 = await test.createAuthenticatedClient()
    const node1 = getNode(test, client1.uuid)
    const node2 = getNode(test, client2.uuid)

    test.server.deleteClient(node1)
    expect(test.server.getClientsByUserId('user-1').size).toBe(1)

    test.server.deleteClient(node2)
    expect(test.server.getClientsByUserId('user-1').size).toBe(0)
  })

  it('disconnects all nodes for a userId', async () => {
    const client1 = await test.createAuthenticatedClient()
    const client2 = await test.createAuthenticatedClient()

    const closeSpy1 = vi.spyOn(getNode(test, client1.uuid), 'close')
    const closeSpy2 = vi.spyOn(getNode(test, client2.uuid), 'close')

    const count = test.server.disconnectUser('user-1')

    expect(count).toBe(2)
    expect(closeSpy1).toHaveBeenCalled()
    expect(closeSpy2).toHaveBeenCalled()
  })

  it('excludes specified node from disconnectUser', async () => {
    const client1 = await test.createAuthenticatedClient()
    const client2 = await test.createAuthenticatedClient()
    const node1 = getNode(test, client1.uuid)

    const closeSpy1 = vi.spyOn(node1, 'close')
    const closeSpy2 = vi.spyOn(getNode(test, client2.uuid), 'close')

    const count = test.server.disconnectUser('user-1', node1.uuid)

    expect(count).toBe(1)
    expect(closeSpy1).not.toHaveBeenCalled()
    expect(closeSpy2).toHaveBeenCalled()
  })

  it('returns 0 for unknown userId on disconnectUser', () => {
    const count = test.server.disconnectUser('nonexistent')
    expect(count).toBe(0)
  })

  it('emits USER_DISCONNECTED event on disconnectUser', async () => {
    await test.createAuthenticatedClient()

    const eventSpy = vi.fn()
    test.server.on(ServerEvents.USER_DISCONNECTED, eventSpy)

    test.server.disconnectUser('user-1')

    expect(eventSpy).toHaveBeenCalledWith({
      userId: 'user-1',
      count: 1,
    })
  })
})
