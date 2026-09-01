import type { ClientNode } from 'typeferry/server'
import {
  type InferNamespace,
  Method,
  Namespace,
  Protected,
  registerNamespace,
  Schema,
} from 'typeferry/server/decorators'
import { z } from 'zod'

import type {
  CreateMessageInput,
  Message,
  MessagesChangedEvent,
} from '@/common/messages'
import { MESSAGES_CHANGED_EVENT } from '@/common/messages'
import { getMessagesCollection } from '@/server/data/collections/messages'

const createMessageSchema = z.object({
  text: z.string().trim().min(1).max(280),
})

@Namespace('messages')
@Protected()
export class MessagesMethods {
  @Method()
  async list(client: ClientNode): Promise<readonly Message[]> {
    const records = await getMessagesCollection()
      .find({ ownerId: String(client.userId) })
      .sort({ createdAt: -1 })
      .toArray()

    return records.map(record => ({
      id: String(record._id),
      text: record.text,
      createdAt: record.createdAt.toISOString(),
    }))
  }

  @Method()
  @Schema(createMessageSchema)
  async create(
    client: ClientNode,
    input: CreateMessageInput,
  ): Promise<Message> {
    const ownerId = String(client.userId)
    const text = input.text.trim()
    const createdAt = new Date()
    const result = await getMessagesCollection().insertOne({
      ownerId,
      text,
      createdAt,
    })

    const message: Message = {
      id: result.insertedId.toHexString(),
      text,
      createdAt: createdAt.toISOString(),
    }
    const event: MessagesChangedEvent = {
      messageId: message.id,
      operation: 'created',
    }

    // Emitting only after create resolves guarantees subscribers can refetch
    // the canonical record as soon as they receive the notification.
    client.server.channel(ownerId).emit(MESSAGES_CHANGED_EVENT, event)

    return message
  }
}

export type MessageApi = InferNamespace<MessagesMethods, 'messages'>

export function registerMessageMethods(): void {
  registerNamespace(MessagesMethods)
}
