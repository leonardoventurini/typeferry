import { ObjectId, type Document } from 'mongodb'
import { z } from 'zod'

import { markObjectIdSchema } from './bson-schema'

/** Zod schema that accepts only native MongoDB `ObjectId` values. */
export function objectId(): z.ZodType<ObjectId> {
  return markObjectIdSchema(
    z.custom<ObjectId>(
      (value): value is ObjectId => value instanceof ObjectId,
      'Expected MongoDB ObjectId',
    ),
  )
}

/** Zod schema that coerces valid hex strings into native MongoDB `ObjectId`s. */
export function coerceObjectId(): z.ZodType<ObjectId> {
  return z.preprocess(value => {
    if (value instanceof ObjectId) return value
    if (typeof value === 'string' && ObjectId.isValid(value)) {
      return new ObjectId(value)
    }
    return value
  }, objectId())
}

/** Converts a hex string or native `ObjectId` into a native `ObjectId`. */
export function toObjectId(value: string | ObjectId): ObjectId {
  if (value instanceof ObjectId) return value
  if (!ObjectId.isValid(value)) {
    throw new Error(`Invalid MongoDB ObjectId "${value}".`)
  }
  return new ObjectId(value)
}

/** Converts a hex string or native `ObjectId` into a stable lowercase hex id. */
export function objectIdHex(value: string | ObjectId): string {
  return toObjectId(value).toHexString()
}

/** Parses an insert document through an explicit Zod schema. */
export function parseInsert<TDocument extends Document>(
  schema: z.ZodType<TDocument>,
  value: unknown,
): TDocument {
  return schema.parse(value)
}

/** Parses a replacement document through an explicit Zod schema. */
export function parseReplacement<TDocument extends Document>(
  schema: z.ZodType<TDocument>,
  value: unknown,
): TDocument {
  return schema.parse(value)
}

/** Parses a `$set` payload through an explicit Zod schema for that payload. */
export function parseSet<TSet extends Document>(
  schema: z.ZodType<TSet>,
  value: unknown,
): TSet {
  return schema.parse(value)
}
