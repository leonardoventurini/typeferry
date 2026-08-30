/** Event emitted to an owner's private channel after their messages change. */
export const MESSAGES_CHANGED_EVENT = 'messages:changed'

export interface Message {
  id: string
  text: string
  createdAt: string
}

export interface CreateMessageInput {
  text: string
}

export interface MessagesChangedEvent {
  messageId: string
  operation: 'created'
}
