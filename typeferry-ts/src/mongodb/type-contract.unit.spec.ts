import { ObjectId, type Collection, type Document, type UpdateFilter } from 'mongodb'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import {
  active,
  coerceObjectId,
  objectId,
  parseInsert,
  projection,
  toObjectId,
  typedMongoCollection,
  withUpdateTimestamp,
  type TypeFerryMongo,
  type MongoCollectionToken,
  type MongoDocumentOf,
} from './index'

const BoardSchema = z.object({
  _id: objectId(),
  name: z.string(),
  author: objectId(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type Board = z.infer<typeof BoardSchema>

class BoardsCollectionDefinition {}

const BoardsCollection = typedMongoCollection<Board>(
  BoardsCollectionDefinition,
)

describe('mongodb type contract', () => {
  it('preserves document type through collection tokens', () => {
    expectTypeOf(BoardsCollection).toEqualTypeOf<MongoCollectionToken<Board>>()
    expectTypeOf<MongoDocumentOf<typeof BoardsCollection>>().toEqualTypeOf<
      Board
    >()

    if (false) {
      const mongo = undefined as unknown as TypeFerryMongo
      const boards = mongo.collection(BoardsCollection)

      expectTypeOf(boards).toEqualTypeOf<Collection<Board>>()

      // @ts-expect-error untyped classes are not valid collection tokens
      mongo.collection(BoardsCollectionDefinition)

      // @ts-expect-error board collections reject non-Board documents
      void boards.insertOne({ _id: new ObjectId(), group: 'settings' })
    }
  })

  it('keeps by-name lookup explicit when no token carries a document type', () => {
    if (false) {
      const mongo = undefined as unknown as TypeFerryMongo

      expectTypeOf(mongo.collectionByName('boards')).toEqualTypeOf<
        Collection<Document>
      >()
      expectTypeOf(mongo.collectionByName<Board>('boards')).toEqualTypeOf<
        Collection<Board>
      >()
    }
  })

  it('preserves schema helper return types', () => {
    const parsed = parseInsert(BoardSchema, {
      _id: new ObjectId(),
      name: 'Roadmap',
      author: new ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expectTypeOf(parsed).toEqualTypeOf<Board>()
    expectTypeOf(coerceObjectId().parse(new ObjectId())).toEqualTypeOf<
      ObjectId
    >()
    expectTypeOf(toObjectId(new ObjectId())).toEqualTypeOf<ObjectId>()
  })

  it('keeps filter and update helpers compatible with driver types', () => {
    const filter = active<Pick<Board, 'author'>>({
      author: new ObjectId(),
    })
    const update = withUpdateTimestamp<UpdateFilter<Board>>({
      $set: { name: 'Roadmap' },
    })

    expectTypeOf(filter.deletedAt).toEqualTypeOf<null>()
    expectTypeOf(update).toEqualTypeOf<UpdateFilter<Board>>()
    expectTypeOf(projection('name author')).toEqualTypeOf<Document>()
  })
})
