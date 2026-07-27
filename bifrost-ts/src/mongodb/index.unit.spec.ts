import { describe, expect, it } from 'vitest'

import * as mongodb from './index'

describe('mongodb package surface', () => {
  it('exports the public driver-first API', () => {
    expect(mongodb.createBifrostMongo).toBeTypeOf('function')
    expect(mongodb.typedMongoCollection).toBeTypeOf('function')
    expect(mongodb.MongoCollection).toBeTypeOf('function')
    expect(mongodb.MongoSchema).toBeTypeOf('function')
    expect(mongodb.MongoIndex).toBeTypeOf('function')
    expect(mongodb.MongoWatch).toBeTypeOf('function')
    expect(mongodb.objectId).toBeTypeOf('function')
    expect(mongodb.coerceObjectId).toBeTypeOf('function')
    expect(mongodb.toObjectId).toBeTypeOf('function')
    expect(mongodb.withInsertTimestamps).toBeTypeOf('function')
    expect(mongodb.withUpdateTimestamp).toBeTypeOf('function')
    expect(mongodb.active).toBeTypeOf('function')
    expect(mongodb.findOneOrCreate).toBeTypeOf('function')
    expect(mongodb.mongoLivePublication).toBeTypeOf('function')
    expect(mongodb.defineMongoLivePublication).toBeTypeOf('function')
    expect(mongodb.createMongoLiveView).toBeTypeOf('function')
  })
})
