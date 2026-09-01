import { ObjectId } from 'mongodb'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  coerceObjectId,
  objectId,
  objectIdHex,
  parseInsert,
  parseReplacement,
  parseSet,
  toObjectId,
} from './schema'

describe('mongodb schema helpers', () => {
  it('validates and coerces native ObjectIds explicitly', () => {
    const id = new ObjectId()

    expect(objectId().parse(id)).toBe(id)
    expect(() => objectId().parse(id.toHexString())).toThrow()
    expect(coerceObjectId().parse(id.toHexString()).toHexString()).toBe(
      id.toHexString(),
    )
    expect(coerceObjectId().parse(id)).toBe(id)
    expect(() => coerceObjectId().parse('bad-id')).toThrow()
    expect(toObjectId(id)).toBe(id)
    expect(toObjectId(id.toHexString()).toHexString()).toBe(id.toHexString())
    expect(objectIdHex(id)).toBe(id.toHexString())
  })

  it('parses inserts, replacements, and set payloads through Zod schemas', () => {
    const schema = z.object({
      _id: objectId(),
      name: z.string().min(1),
    })
    const value = { _id: new ObjectId(), name: 'Roadmap' }

    expect(parseInsert(schema, value)).toEqual(value)
    expect(parseReplacement(schema, value)).toEqual(value)
    expect(parseSet(z.object({ name: z.string() }), { name: 'Updated' })).toEqual(
      { name: 'Updated' },
    )
    expect(() => parseInsert(schema, { _id: new ObjectId(), name: '' })).toThrow()
  })
})
