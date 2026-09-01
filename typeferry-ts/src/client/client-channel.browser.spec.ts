import { describe, expect, it } from 'vitest'

import { ClientChannel } from './client-channel'

/**
 * Guards the browser import path that previously failed when TypeFerry exposed
 * CommonJS event emitter dependencies through source-first modules.
 */
describe('ClientChannel browser import', () => {
  it('loads and emits without external emitter interop', async () => {
    const channel = new ClientChannel('browser-test')
    const result = channel.wait('ping')

    channel.emit('ping', 'payload')

    await expect(result).resolves.to.equal('payload')
  })
})
