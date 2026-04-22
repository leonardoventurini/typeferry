import { ObjectId } from 'mongodb'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  getMongoCollectionDefinition,
  MongoCollection,
  MongoIndex,
  MongoSchema,
  MongoWatch,
} from './decorators'
import { objectId } from './schema'

const BoardSchema = z.object({
  _id: objectId(),
  author: objectId(),
  name: z.string(),
})

type Board = z.infer<typeof BoardSchema>

describe('mongodb decorators', () => {
  it('composes collection metadata on a class', () => {
    @MongoCollection('boards')
    @MongoSchema(BoardSchema)
    @MongoIndex({ author: 1 })
    @MongoWatch<Board>({
      event: 'boards.changed',
      eventOptions: { protected: true },
      getChannel: board => board.author.toHexString(),
      excludeFields: ['analytics'],
    })
    class BoardsCollectionDefinition {}

    const definition = getMongoCollectionDefinition(BoardsCollectionDefinition)

    expect(definition.name).toBe('boards')
    expect(definition.schema?.parse({
      _id: new ObjectId(),
      author: new ObjectId(),
      name: 'Roadmap',
    })).toMatchObject({ name: 'Roadmap' })
    expect(definition.indexes).toHaveLength(1)
    expect(definition.indexes[0]?.spec).toEqual({ author: 1 })
    expect(definition.watches).toHaveLength(1)
    expect(definition.watches[0]?.event).toBe('boards.changed')
  })

  it('keeps same-file class metadata isolated', () => {
    @MongoCollection('boards_a')
    @MongoIndex({ name: 1 })
    class FirstCollectionDefinition {}

    @MongoCollection('boards_b')
    @MongoIndex({ updatedAt: -1 })
    class SecondCollectionDefinition {}

    const first = getMongoCollectionDefinition(FirstCollectionDefinition)
    const second = getMongoCollectionDefinition(SecondCollectionDefinition)

    expect(first.name).toBe('boards_a')
    expect(first.indexes[0]?.spec).toEqual({ name: 1 })
    expect(second.name).toBe('boards_b')
    expect(second.indexes[0]?.spec).toEqual({ updatedAt: -1 })
  })

  it('throws when a class has no collection decorator', () => {
    class MissingCollectionDefinition {}

    expect(() =>
      getMongoCollectionDefinition(MissingCollectionDefinition),
    ).toThrow('missing @MongoCollection decorator')
  })
})
