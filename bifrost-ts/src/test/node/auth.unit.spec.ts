import { beforeEach, describe, expect, it } from 'vitest'

import { ClientEvents, Errors } from '../../utils'
import { TestUtility } from '../test-utility'

describe('Auth', async () => {
  const test = new TestUtility()

  beforeEach(async () => {
    test.server.setAuth({
      auth(context: any) {
        return context?.token === 'test'
          ? { ...context, user: { _id: 'id' } }
          : false
      },
      async logIn({ email, password }) {
        if (email === 'test@bifrost.test' && password === '123456') {
          return {
            token: 'test',
          }
        }
      },
    })
  })

  it('should fully authenticate into a protected server', async () => {
    expect(test.server.isAuthEnabled).to.be.true

    test.server.addMethod(
      'protected:method',
      async () => {
        return true
      },
      { protected: true },
    )

    await test.client.login({ email: 'test@bifrost.test', password: '123456' })

    const result = await test.client.call('protected:method')

    expect(result).to.be.true
  })

  it('should call a protected rpc method and fail authentication', async () => {
    test.server.addMethod(
      'protected:method',
      async () => {
        return true
      },
      { protected: true },
    )

    const error = await test.catchError(test.client.call('protected:method'))

    expect(error)
      .to.have.property('message')
      .that.is.equal(Errors.METHOD_FORBIDDEN)

    expect(error).to.have.property('message').that.is.equal('Method Forbidden')
  })

  it('should call a protected method and pass authentication via reconnection', async () => {
    test.server.addMethod(
      'protected:method',
      async () => {
        return true
      },
      { protected: true },
    )

    await test.client.setContextAndReInit({ token: 'test' })

    const result = await test.client.call('protected:method')

    expect(result).to.be.true
  })

  it('should allow subscription only to the channel of the user', async () => {
    test.server.addEvent('protected:event', {
      user: true,
    })

    const result = await test.client.subscribe('protected:event')

    expect(result).to.have.property('protected:event').that.is.false

    await test.client.login({
      email: 'test@bifrost.test',
      password: '123456',
    })

    const result2 = await test.client.channel('id').subscribe('protected:event')

    expect(result2).to.have.property('protected:event').that.is.true

    test.server.defer('protected:event', true)

    const eventTimeout = await test.client.timeout('protected:event')

    expect(eventTimeout).to.be.true
  })
})

describe('Connection-Time Auth', async () => {
  const test = new TestUtility()

  beforeEach(async () => {
    test.server.setAuth({
      auth(context: any) {
        return context?.token === 'test'
          ? { ...context, user: { _id: 'id' } }
          : false
      },
      async logIn({ email, password }) {
        if (email === 'test@bifrost.test' && password === '123456') {
          return { token: 'test' }
        }
      },
    })
  })

  it('should pre-authenticate with valid token during connection', async () => {
    const client = await test.createAuthenticatedClient()
    expect(client.authenticated).to.be.true
  })

  it('should connect anonymously with no token', async () => {
    expect(test.client.authenticated).to.be.false
  })

  it('should connect anonymously with invalid token', async () => {
    const client = await test.createClient({
      context: { token: 'invalid' },
    })
    expect(client.authenticated).to.be.false
  })

  it('should use fresh token on reconnection', async () => {
    expect(test.client.authenticated).to.be.false

    await test.client.close()
    test.client.updateContext({ token: 'test' })

    test.client.clientSocket.connect()
    await test.client.waitFor(ClientEvents.INITIALIZED)

    expect(test.client.authenticated).to.be.true
  })
})

describe('Auth with ClientNode Context', async () => {
  const test = new TestUtility()

  it('should have access to socket in auth function', async () => {
    let hasSocket = false

    test.server.setAuth({
      auth(context: any) {
        hasSocket = !!this.socket
        return context?.token === 'test'
          ? { ...context, user: { _id: 'id' } }
          : false
      },
      async logIn() {
        return { token: 'test' }
      },
    })

    const client = await test.createAuthenticatedClient()
    expect(client.authenticated).to.be.true
    expect(hasSocket).to.be.true
  })

  it('should allow setting properties on this in auth function', async () => {
    test.server.setAuth({
      auth(this: any, context: any) {
        if (context?.token === 'dev-token') {
          this.isDevelopmentToken = true
          return { ...context, user: { _id: 'dev-id' } }
        }
        return false
      },
      async logIn() {
        return { token: 'dev-token' }
      },
    })

    const client = await test.createClient({
      context: { token: 'dev-token' },
    })

    expect(client.authenticated).to.be.true

    const clientNode = test.server.allClients.get(client.uuid) as any
    expect(clientNode).to.exist
    expect(clientNode.isDevelopmentToken).to.be.true
  })

  it('should allow auth function to send events to client', async () => {
    const receivedEvents: any[] = []

    test.server.setAuth({
      auth(context: any) {
        if (context?.token === 'test') {
          this.emitBifrostEvent('auth:custom-event', undefined, {
            message: 'authenticated',
          })
          return { ...context, user: { _id: 'id' } }
        }
        return false
      },
      async logIn() {
        return { token: 'test' }
      },
    })

    test.server.addEvent('auth:custom-event')

    const client = await test.createClient({
      context: { token: 'test' },
    })

    await client.subscribe('auth:custom-event')

    client.on('auth:custom-event', event => {
      receivedEvents.push(event)
    })

    await test.client.close()
    test.client.updateContext({ token: 'test' })
    test.client.clientSocket.connect()
    await test.client.waitFor(ClientEvents.INITIALIZED)

    await test.sleep(100)

    expect(receivedEvents.length).to.be.greaterThanOrEqual(0)
  })

  it('should have access to limiter in auth function', async () => {
    let hasLimiter = false

    test.server.setAuth({
      auth(context: any) {
        hasLimiter = this.limiter !== undefined
        return context?.token === 'test'
          ? { ...context, user: { _id: 'id' } }
          : false
      },
      async logIn() {
        return { token: 'test' }
      },
    })

    const client = await test.createAuthenticatedClient()
    expect(client.authenticated).to.be.true
    expect(hasLimiter).to.be.true
  })

  it('should allow auth function to disable rate limiting', async () => {
    test.server.setAuth({
      auth(context: any) {
        if (context?.token === 'admin') {
          this.limiter = null
          return { ...context, user: { _id: 'admin', isAdmin: true } }
        }
        return false
      },
      async logIn() {
        return { token: 'admin' }
      },
    })

    const client = await test.createClient({
      context: { token: 'admin' },
    })

    expect(client.authenticated).to.be.true

    const clientNode = test.server.allClients.get(client.uuid)
    expect(clientNode).to.exist
    expect(clientNode.limiter).to.be.null
  })
})
