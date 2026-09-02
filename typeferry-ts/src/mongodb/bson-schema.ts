import type { z } from 'zod'

const objectIdSchemas = new WeakSet<z.core.$ZodType>()

/** Marks a Zod schema as representing a native BSON ObjectId. */
export function markObjectIdSchema<TSchema extends z.core.$ZodType>(
  schema: TSchema,
): TSchema {
  objectIdSchemas.add(schema)
  return schema
}

/** Tests whether a schema was created by TypeFerry's ObjectId helper. */
export function isObjectIdSchema(schema: z.core.$ZodType): boolean {
  return objectIdSchemas.has(schema)
}
