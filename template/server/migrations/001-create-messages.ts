import type { Migration } from '@/server/migrations/types'

export const createMessagesMigration: Migration = {
  version: 1,
  name: 'create messages indexes',
  async up(database): Promise<void> {
    const collections = await database
      .listCollections({ name: 'messages' })
      .toArray()
    if (collections.length === 0) await database.createCollection('messages')

    await database.collection('messages').createIndex({ createdAt: -1 })
  },
}
