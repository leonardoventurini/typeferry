import { afterEach, describe, expect, it } from 'vitest'

import { RedisTransport } from '../../server'
import { RedisTestUtility } from '../redis-test-utility'
import { TestUtility } from '../test-utility'

describe('Redis Pub/Sub', () => {
  const redis = new RedisTestUtility()
  const test1 = new TestUtility({ globalInstance: false, redis: true })
  const test2 = new TestUtility({ globalInstance: false, redis: true })

  afterEach(async () => {
    const keys = await redis.pub.keys('typeferry:*')

    for (const key of keys) {
      await redis.pub.del(key)
    }
  })

  it('the server object should have the redis transport instantiated', async () => {
    expect(test1.server)
      .to.have.property('redisTransport')
      .that.is.instanceof(RedisTransport)

    expect(test2.server)
      .to.have.property('redisTransport')
      .that.is.instanceof(RedisTransport)
  })

  it('should publish and receive message', async () => {
    const { ready, message } = redis.subscribe('fake:channel')
    await ready

    await redis.pub?.publish('fake:channel', 'test')

    const data = await message

    expect(data).to.have.property('channel').that.equals('fake:channel')
    expect(data).to.have.property('message').that.equals('test')
  })

  it('should emit an event in one server and both clients should fire', async () => {
    await test1.createEvent('monkey:king', undefined, { cluster: true })
    await test2.createEvent('monkey:king', undefined, { cluster: true })

    test1.server.defer('monkey:king', 11)

    const data2 = await test2.client.wait('monkey:king')

    expect(data2).to.be.equal(11)
  })

  it('should not propagate an event if it does not have the cluster flag', async () => {
    await test1.createEvent('monkey:king')
    await test2.createEvent('monkey:king')

    test1.server.defer('monkey:king', 11)

    const data1 = await test1.client.wait('monkey:king')
    const timeout = await test2.client.timeout('monkey:king')

    expect(data1).to.be.equal(11)
    expect(timeout).to.be.equal(true)
  })
})
