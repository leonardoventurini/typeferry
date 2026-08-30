import type { Collection } from 'mongodb'

import { getDatabase } from '@/server/data/database'

export interface MessageDocument {
  ownerId: string
  text: string
  createdAt: Date
}

/** Returns the typed collection from the active process-wide database. */
export function getMessagesCollection(): Collection<MessageDocument> {
  return getDatabase().collection<MessageDocument>('messages')
}
