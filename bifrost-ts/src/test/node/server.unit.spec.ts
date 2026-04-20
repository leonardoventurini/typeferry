import { describe, expect, it } from 'vitest'

import { EJSON } from '../../ejson'
import { HttpTransport, Server, WebSocketTransport } from '../../server'
import { ServerEvents } from '../../utils'
import { TestUtility } from '../test-utility'

describe('Server', () => {
  const test = new TestUtility()

  it('should have the correct structure', async () => {
    expect(test).to.have.property('server').that.is.instanceof(Server)

    const { server } = test

    expect(server)
      .to.have.property('uuid')
      .that.is.a('string')
      .and.have.length(36)

    expect(server).to.have.property('host').that.is.a('string')

    expect(server).to.have.property('port').that.is.a('number')

    expect(server)
      .to.have.property('httpTransport')
      .that.is.instanceof(HttpTransport)

    expect(server)
      .to.have.property('webSocketTransport')
      .that.is.instanceof(WebSocketTransport)

    expect(server).to.have.property('redisTransport').that.is.null
  })

  it('should return a new instance', async () => {
    const srv = await test.createRandomSrv({
      globalInstance: true,
    })

    expect(test.server).to.be.an.instanceOf(Server)

    expect(global)
      .to.have.property('Bifrost')
      .that.is.an('object')
      .and.is.instanceOf(Server)

    await srv.close()
  })

  it('should close the server and remove the global instance', async () => {
    // Store reference to the main global instance before test
    const originalBifrost = global.Bifrost

    const srv = await test.createRandomSrv({
      globalInstance: true,
    })

    expect(global).to.have.property('Bifrost').that.is.not.undefined

    await global.Bifrost.close()

    expect(global).to.not.have.property('Bifrost')

    // Restore original global instance for other tests
    if (originalBifrost) {
      global.Bifrost = originalBifrost
    }
  })

  it('should throw an error when trying to create a second instance', async () => {
    // Store reference to the main global instance before test
    const originalBifrost = global.Bifrost

    await test.server.close()

    // Clear global for this test
    delete global.Bifrost

    const srv = new Server({
      globalInstance: true,
      port: 0,
    })

    expect(
      () =>
        new Server({
          globalInstance: true,
          port: 0,
        }),
    ).to.throw('There can only be one instance of Bifrost.')

    await srv.close()

    // Restore original global instance for other tests
    if (originalBifrost) {
      global.Bifrost = originalBifrost
    }
  })

  it('should create a server instance with a custom request listener', async () => {
    let requestBody = null

    // Store reference to the main global instance before test
    const originalBifrost = global.Bifrost

    await test.server.close()

    // Temporarily clear global for this test
    delete global.Bifrost

    const server = await test.createRandomSrv({
      requestListener(req, res) {
        req.on('data', buffer => {
          requestBody = EJSON.parse(buffer.toString())
        })
      },
    })

    server.addMethod('test', () => true)

    const client = await test.createClient({ port: server.port })

    const result = await client.call('test', null, { http: true })

    expect(result).to.be.true

    expect(requestBody)
      .to.have.property('payload')
      .which.is.an('object')
      .with.property('method')
      .that.equals('test')

    await client.close()
    await server.close()

    // Restore original global instance for other tests
    if (originalBifrost) {
      global.Bifrost = originalBifrost
    }
  })

  it('should delete client nodes on disconnect by close', async () => {
    const server = await test.createRandomSrv({ globalInstance: false })

    server.addEvent('test')

    const client = await test.createClient({ port: server.port })

    server.channel('test:channel')

    await client.channel('test:channel').subscribe('test')

    expect(server.allClients.size).to.equal(1)

    // Verify subscribed using isSubscribed
    const node = server.allClients.get(client.uuid)!
    const event = server.events.get('test')!
    expect(server.channel('test:channel').isSubscribed(node, event)).to.be.true

    let nodeEmittedDisconnect = false

    node.once(ServerEvents.DISCONNECT, () => {
      nodeEmittedDisconnect = true
    })

    client.close().catch(console.error)

    await server.waitFor(ServerEvents.DISCONNECTION)

    expect(nodeEmittedDisconnect).to.be.true

    // Client should be removed from allClients
    expect(server.allClients.size).to.equal(0)
  })

  it('should send meta data to the server', async () => {
    const server = await test.createRandomSrv({ globalInstance: false })

    const client = await test.createClient({
      port: server.port,
      meta: { test: true },
    })

    expect(
      Array.from(server.allClients.values()).map(({ uuid }) => uuid),
    ).to.be.deep.equal([client.uuid])

    const node = server.allClients.get(client.uuid)

    expect(node.meta).to.deep.equal({
      test: true,
    })

    expect(node.remoteAddress).to.be.a('string').and.not.be.empty
  })

  it('should create and call method using proxy syntax', async () => {
    ;(test.server.m.test as any).proxy = async num => num * 2

    const result = await (test.client.m.test as any).proxy(4, {
      http: true,
    })

    expect(result).to.equal(8)
  })
})
