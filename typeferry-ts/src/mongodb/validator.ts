import type { Document } from 'mongodb'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'

import { isObjectIdSchema } from './bson-schema'

type JsonObject = Record<string, unknown>

const BSON_NUMERIC_TYPES = ['int', 'long', 'double', 'decimal'] as const

/**
 * MongoDB accepts a deliberately smaller JSON Schema vocabulary than the
 * general JSON Schema dialect emitted by Zod. Keep this allow-list explicit so
 * a newly emitted keyword cannot silently weaken a database validator.
 */
const BSON_SCHEMA_KEYS = new Set([
  'additionalProperties',
  'allOf',
  'anyOf',
  'bsonType',
  'description',
  'enum',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'items',
  'maximum',
  'maxItems',
  'maxLength',
  'minimum',
  'minItems',
  'minLength',
  'multipleOf',
  'not',
  'oneOf',
  'pattern',
  'properties',
  'required',
  'type',
  'uniqueItems',
])

/** Compiles a supported Zod document schema into MongoDB's BSON schema dialect. */
export function toMongoJsonSchema<TDocument extends Document>(
  schema: z.ZodType<TDocument>,
): Document {
  const jsonSchema = z.toJSONSchema(schema, {
    target: 'draft-04',
    io: 'output',
    cycles: 'throw',
    reused: 'inline',
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema: generated, path }) => {
      if (isObjectIdSchema(zodSchema)) {
        replaceContents(generated, { bsonType: 'objectId' })
        return
      }

      if (zodSchema instanceof z.ZodDate) {
        replaceContents(generated, { bsonType: 'date' })
        return
      }

      if (Object.keys(generated).length === 0) {
        const location = path.length > 0 ? path.join('.') : '<root>'
        throw new Error(
          `Cannot derive a MongoDB validator for unsupported Zod schema at ${location}.`,
        )
      }
    },
  })

  const converted = convertSchema(jsonSchema, [])
  delete converted.$schema
  allowGeneratedObjectId(converted)
  return converted
}

/** Wraps a compiled BSON schema in MongoDB's collection-validator shape. */
export function mongoValidator<TDocument extends Document>(
  schema: z.ZodType<TDocument>,
): Document {
  return { $jsonSchema: toMongoJsonSchema(schema) }
}

function convertSchema(value: unknown, path: readonly string[]): JsonObject {
  if (!isJsonObject(value)) {
    throwUnsupported(path, 'Zod emitted a non-object JSON Schema node.')
  }

  if (Object.keys(value).length === 0) {
    throwUnsupported(path, 'Zod emitted an unconstrained JSON Schema node.')
  }

  const normalizedValue = normalizeHomogeneousVariadicTuple(value, path)

  const result: JsonObject = {}
  for (const [key, child] of Object.entries(normalizedValue)) {
    if (key === '$schema' || key === '~standard') continue

    if (key === 'type') {
      result.bsonType = convertJsonTypes(child)
      continue
    }

    if (key === 'properties' && isJsonObject(child)) {
      result.properties = Object.fromEntries(
        Object.entries(child).map(([name, property]) => [
          name,
          convertSchema(property, [...path, 'properties', name]),
        ]),
      )
      continue
    }

    if (key === 'items') {
      if (!isJsonObject(child)) {
        throwUnsupported([...path, key], 'Tuple schemas are not supported.')
      }
      result.items = convertSchema(child, [...path, key])
      continue
    }

    if (['allOf', 'anyOf', 'oneOf'].includes(key) && Array.isArray(child)) {
      result[key] = child.map((item, index) =>
        convertSchema(item, [...path, key, String(index)]),
      )
      continue
    }

    if (key === 'not' && isJsonObject(child)) {
      result.not = convertSchema(child, [...path, key])
      continue
    }

    if (key === 'additionalProperties') {
      if (typeof child === 'boolean') {
        result.additionalProperties = child
      } else if (isJsonObject(child)) {
        result.additionalProperties = convertSchema(child, [...path, key])
      } else {
        throwUnsupported(
          [...path, key],
          'Zod emitted an invalid additionalProperties schema.',
        )
      }
      continue
    }

    if (key === 'const') {
      result.enum = [child]
      continue
    }

    if (key === 'readOnly') {
      continue
    }

    if (key === 'format') {
      if (typeof normalizedValue.pattern !== 'string') {
        throwUnsupported(
          [...path, key],
          `Zod string format "${String(child)}" has no MongoDB-compatible pattern.`,
        )
      }
      continue
    }

    if (!BSON_SCHEMA_KEYS.has(key)) {
      throwUnsupported(
        [...path, key],
        `Zod emitted unsupported JSON Schema keyword "${key}".`,
      )
    }

    result[key] = child
  }

  if (Object.keys(result).length === 0) {
    throwUnsupported(path, 'Zod emitted an unconstrained JSON Schema node.')
  }

  return result
}

/**
 * Collapses the losslessly representable subset of draft-04 tuple schemas.
 *
 * MongoDB cannot enforce positional tuples. A Zod variadic tuple is equivalent
 * to a homogeneous array only when every required prefix item is structurally
 * identical to its rest item; the prefix length then becomes `minItems`.
 */
function normalizeHomogeneousVariadicTuple(
  value: JsonObject,
  path: readonly string[],
): JsonObject {
  if (!Array.isArray(value.items)) return value

  if (!isJsonObject(value.additionalItems)) {
    throwUnsupported(path, 'Tuple schemas are not supported.')
  }

  const rest = convertSchema(value.additionalItems, [
    ...path,
    'additionalItems',
  ])
  const prefix = value.items.map((item, index) =>
    convertSchema(item, [...path, 'items', String(index)]),
  )
  if (!prefix.every((item) => isDeepStrictEqual(item, rest))) {
    throwUnsupported(path, 'Tuple schemas are not supported.')
  }

  const normalized: JsonObject = {
    ...value,
    items: value.additionalItems,
    minItems: prefix.length,
  }
  delete normalized.additionalItems
  return normalized
}

function convertJsonTypes(value: unknown): string | readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(convertJsonType)
  }
  if (typeof value !== 'string') {
    throw new Error('Zod emitted an invalid JSON Schema type.')
  }
  return convertJsonType(value)
}

function convertJsonType(value: string): readonly string[] | string {
  if (value === 'number' || value === 'integer') return BSON_NUMERIC_TYPES
  if (value === 'boolean') return 'bool'
  return value
}

function allowGeneratedObjectId(schema: JsonObject): void {
  if (schema.bsonType !== 'object') return

  const properties = schema.properties
  if (!isJsonObject(properties) || Object.hasOwn(properties, '_id')) return

  schema.properties = {
    _id: { bsonType: 'objectId' },
    ...properties,
  }
}

function replaceContents(target: JsonObject, replacement: JsonObject): void {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, replacement)
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function throwUnsupported(path: readonly string[], message: string): never {
  const location = path.length > 0 ? path.join('.') : '<root>'
  throw new Error(`${message} at ${location}.`)
}
