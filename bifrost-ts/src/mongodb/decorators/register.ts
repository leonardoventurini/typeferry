import type { MongoCollectionClass, MongoCollectionDefinition } from '../types'

import { getMongoCollectionMeta } from './metadata'

/** Reads and validates metadata for a decorated MongoDB collection class. */
export function getMongoCollectionDefinition(
  Class: MongoCollectionClass,
): MongoCollectionDefinition {
  const definition = getMongoCollectionMeta(Class)
  if (!definition) {
    throw new Error(
      `Class "${Class.name}" is missing @MongoCollection decorator.`,
    )
  }
  return definition
}
