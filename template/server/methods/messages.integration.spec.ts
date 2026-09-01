import type { ClientNode } from 'typeferry/server'
import { describe, expect, it, vi } from 'vitest'

import { MESSAGES_CHANGED_EVENT } from '@/common/messages'
import { getMessagesCollection } from '@/server/data/collections/messages'
import { MessagesMethods } from '@/server/methods/messages'

describe('messages methods', () => {
  it('persists owner data before emitting a private invalidation event', async () => {
    const emit = vi.fn()
    const channel = vi.fn(() => ({ emit }))
    const client = {
      userId: 'sample-user',
      server: { channel },
    } as unknown as ClientNode
    const methods = new MessagesMethods()

    const created = await methods.create(client, {
      text: '  Hello, TypeFerry!  ',
    })

    expect(created).toMatchObject({ text: 'Hello, TypeFerry!' })
    expect(await getMessagesCollection().countDocuments()).toBe(1)
    expect(await methods.list(client)).toEqual([created])
    expect(channel).toHaveBeenCalledWith('sample-user')
    expect(emit).toHaveBeenCalledWith(MESSAGES_CHANGED_EVENT, {
      messageId: created.id,
      operation: 'created',
    })
  })

  it('isolates canonical reads by authenticated owner', async () => {
    const createdAt = new Date('2026-08-30T12:00:00.000Z')
    await getMessagesCollection().insertMany([
      { ownerId: 'sample-user', text: 'Visible', createdAt },
      { ownerId: 'another-user', text: 'Private', createdAt },
    ])
    const client = { userId: 'sample-user' } as unknown as ClientNode

    const messages = await new MessagesMethods().list(client)

    expect(messages.map(message => message.text)).toEqual(['Visible'])
  })
})
