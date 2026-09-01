import type {
  Collection,
  Document,
  Filter,
  OptionalUnlessRequiredId,
  UpdateFilter,
} from 'mongodb'

import type { MongoSessionOptions } from './types'

/** Finds one matching document or atomically creates it with `$setOnInsert`. */
export async function findOneOrCreate<TDocument extends Document>(
  collection: Collection<TDocument>,
  filter: Filter<TDocument>,
  create: OptionalUnlessRequiredId<TDocument>,
  options: MongoSessionOptions = {},
): Promise<TDocument> {
  const update = {
    $setOnInsert: create,
  } as UpdateFilter<TDocument>

  const document = await collection.findOneAndUpdate(filter, update, {
    upsert: true,
    returnDocument: 'after',
    session: options.session,
  })

  if (!document) {
    throw new Error('findOneOrCreate failed to return an upserted document.')
  }

  return document as TDocument
}
