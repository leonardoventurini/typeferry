import type { Document } from 'mongodb'

import type {
  MongoCollectionClass,
  MongoCollectionDefinition,
  MongoIndexDefinition,
  MongoWatchDefinition,
} from '../types'

/** Internal metadata stored for decorated MongoDB collection classes. */
export interface MutableMongoCollectionDefinition<
  TDocument extends Document = Document,
> {
  /** Decorated class that owns this metadata. */
  Class: MongoCollectionClass
  /** MongoDB collection name. */
  name?: string
  /** Optional Zod schema stored by `@MongoSchema`. */
  schema?: MongoCollectionDefinition<TDocument>['schema']
  /** Declared index metadata. */
  indexes: MongoIndexDefinition[]
  /** Declared watch metadata. */
  watches: MongoWatchDefinition<TDocument>[]
}

/** WeakMap store for MongoDB collection decorator metadata. */
export const MONGO_COLLECTION_META = new WeakMap<
  MongoCollectionClass,
  MutableMongoCollectionDefinition
>()

/** Returns existing mutable collection metadata or creates an empty record. */
export function getOrCreateMongoCollectionMeta(
  Class: MongoCollectionClass,
): MutableMongoCollectionDefinition {
  let meta = MONGO_COLLECTION_META.get(Class)
  if (!meta) {
    meta = {
      Class,
      indexes: [],
      watches: [],
    }
    MONGO_COLLECTION_META.set(Class, meta)
  }
  return meta
}

/** Reads immutable collection metadata when registration validates it exists. */
export function getMongoCollectionMeta(
  Class: MongoCollectionClass,
): MongoCollectionDefinition | undefined {
  const meta = MONGO_COLLECTION_META.get(Class)
  if (!meta?.name) return undefined

  return {
    Class,
    name: meta.name,
    schema: meta.schema,
    indexes: [...meta.indexes],
    watches: [...meta.watches],
  }
}
