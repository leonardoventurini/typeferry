import type {
  CreateIndexesOptions,
  Document,
  IndexSpecification,
} from 'mongodb'
import type { z } from 'zod'

import type { MongoCollectionClass } from '../types'

import { getOrCreateMongoCollectionMeta } from './metadata'

/** Declares the MongoDB collection name for a collection definition class. */
export function MongoCollection(
  name: string,
): <TClass extends MongoCollectionClass>(
  Class: TClass,
  context: ClassDecoratorContext<TClass>,
) => TClass {
  return function <TClass extends MongoCollectionClass>(
    Class: TClass,
    _context: ClassDecoratorContext<TClass>,
  ): TClass {
    const meta = getOrCreateMongoCollectionMeta(Class)
    meta.name = name
    return Class
  }
}

/** Declares the Zod document schema associated with a collection definition. */
export function MongoSchema<TDocument extends Document>(
  schema: z.ZodType<TDocument>,
): <TClass extends MongoCollectionClass>(
  Class: TClass,
  context: ClassDecoratorContext<TClass>,
) => TClass {
  return function <TClass extends MongoCollectionClass>(
    Class: TClass,
    _context: ClassDecoratorContext<TClass>,
  ): TClass {
    const meta = getOrCreateMongoCollectionMeta(Class)
    meta.schema = schema
    return Class
  }
}

/** Declares an index that can be created by `ensureIndexes()`. */
export function MongoIndex(
  spec: IndexSpecification,
  options?: CreateIndexesOptions,
): <TClass extends MongoCollectionClass>(
  Class: TClass,
  context: ClassDecoratorContext<TClass>,
) => TClass {
  return function <TClass extends MongoCollectionClass>(
    Class: TClass,
    _context: ClassDecoratorContext<TClass>,
  ): TClass {
    const meta = getOrCreateMongoCollectionMeta(Class)
    meta.indexes.push({ spec, options })
    return Class
  }
}
