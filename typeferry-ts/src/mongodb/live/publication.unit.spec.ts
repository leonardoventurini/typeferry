import { ObjectId, type Document } from 'mongodb'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import { typedMongoCollection } from '../types'
import { defineMongoLivePublication } from './publication'
import {
  mongoLivePublication,
  type MongoLiveClientDocument,
} from './types'

interface Board extends Document {
  _id: ObjectId
  owner: string
  name: string
  score: number
  secret: string
}

interface BoardFields {
  readonly name: string
}

const boardDescriptor = mongoLivePublication<
  { readonly owner: string },
  MongoLiveClientDocument<BoardFields>
>()('boards.mine')

class BoardsCollection {}

const Boards = typedMongoCollection<Board>(BoardsCollection)

describe('MongoDB live publication contracts', () => {
  it('preserves literal names, arguments, and projected result types', () => {
    const publication = defineMongoLivePublication(boardDescriptor, {
      collection: Boards,
      args: z.object({ owner: z.string() }),
      authorize: (_context, args): { readonly owner: string } => ({
        owner: args.owner,
      }),
      filter: (scope: { readonly owner: string }) => ({ owner: scope.owner }),
      window: () => ({
        sort: { score: -1 as const },
        skip: 2,
        limit: 5,
      }),
      project: document => ({ name: document.name }),
    })

    expect(publication.name).toBe('boards.mine')
    expect(publication.protected).toBe(true)
    expectTypeOf(publication.descriptor.name).toEqualTypeOf<'boards.mine'>()
    expect(publication.parseArgs({ owner: 'owner-1' })).toEqual({
      owner: 'owner-1',
    })
    expect(() => publication.parseArgs({ owner: 1 })).toThrow()
    expect(publication.window({}, {})).toEqual({
      sort: { score: -1 },
      skip: 2,
      limit: 5,
    })
  })

  it('requires public access to be explicit and rejects projected identity', async () => {
    const publication = defineMongoLivePublication(boardDescriptor, {
      collection: Boards,
      args: z.object({ owner: z.string() }),
      protected: false,
      authorize: (_context, args) => ({ owner: args.owner }),
      filter: scope => ({ owner: scope.owner }),
      project: document =>
        ({ _id: document._id, name: document.name }) as never,
    })

    expect(publication.protected).toBe(false)
    await expect(
      publication.project(
        {
          _id: new ObjectId(),
          owner: 'owner-1',
          name: 'Roadmap',
          score: 1,
          secret: 'hidden',
        },
        { owner: 'owner-1' },
      ),
    ).rejects.toThrow('must not project "_id"')
  })
})
