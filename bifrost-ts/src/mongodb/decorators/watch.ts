import type { Document } from 'mongodb'

import type { MongoCollectionClass, MongoWatchDefinition } from '../types'

import { getOrCreateMongoCollectionMeta } from './metadata'

/** Declares a MongoDB change stream that emits through Bifrost events. */
export function MongoWatch<TDocument extends Document = Document>(
  definition: MongoWatchDefinition<TDocument>,
): <TClass extends MongoCollectionClass>(
  Class: TClass,
  context: ClassDecoratorContext<TClass>,
) => TClass {
  return function <TClass extends MongoCollectionClass>(
    Class: TClass,
    _context: ClassDecoratorContext<TClass>,
  ): TClass {
    const meta = getOrCreateMongoCollectionMeta(Class)
    meta.watches.push(definition as MongoWatchDefinition<Document>)
    return Class
  }
}
