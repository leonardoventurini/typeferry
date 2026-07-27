import { describe, expectTypeOf, it } from 'vitest'
import type { Document, ObjectId } from 'mongodb'

import {
  mongoLivePublication,
  type MongoLiveArgsOf,
  type MongoLiveClientDocument,
  type MongoLiveDocumentOf,
  type MongoLiveId,
  type MongoLivePublicationDescriptor,
  type MongoLiveWindow,
} from './types'

interface BoardFields {
  readonly name: string
}

interface MessageFields {
  readonly body: string
  readonly unread: boolean
}

interface StoredBoard extends Document {
  readonly _id: ObjectId
  readonly score: number
  readonly name: string
}

const validWindow: MongoLiveWindow<StoredBoard> = {
  sort: { score: -1, name: 1 },
  limit: 10,
}

const invalidIdentityWindow: MongoLiveWindow<StoredBoard> = {
  // @ts-expect-error identity ordering is appended by the runtime.
  sort: { _id: 1 },
  limit: 10,
}

void validWindow
void invalidIdentityWindow

const boards = mongoLivePublication<
  { readonly owner: string },
  MongoLiveClientDocument<BoardFields>
>()('boards.mine')

const messages = mongoLivePublication<
  { readonly threadId: number },
  MongoLiveClientDocument<MessageFields>
>()('messages.thread')

describe('MongoDB live public type contract', () => {
  it('preserves heterogeneous argument and result types', () => {
    expectTypeOf(boards.name).toEqualTypeOf<'boards.mine'>()
    expectTypeOf(messages.name).toEqualTypeOf<'messages.thread'>()
    expectTypeOf<MongoLiveArgsOf<typeof boards>>().toEqualTypeOf<{
      readonly owner: string
    }>()
    expectTypeOf<MongoLiveDocumentOf<typeof messages>>().toEqualTypeOf<
      Readonly<{ _id: MongoLiveId } & MessageFields>
    >()

    acceptPublicationArgs(boards, { owner: 'owner-1' })
    acceptPublicationArgs(messages, { threadId: 42 })

    // @ts-expect-error board publications do not accept message arguments.
    acceptPublicationArgs(boards, { threadId: 42 })
    // @ts-expect-error message publications require a numeric thread id.
    acceptPublicationArgs(messages, { threadId: '42' })
  })
})

function acceptPublicationArgs<
  TDescriptor extends MongoLivePublicationDescriptor<
    string,
    unknown,
    { readonly _id: MongoLiveId }
  >,
>(
  _descriptor: TDescriptor,
  _args: MongoLiveArgsOf<TDescriptor>,
): void {}
