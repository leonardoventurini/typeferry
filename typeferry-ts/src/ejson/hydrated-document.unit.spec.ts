import { ObjectId } from 'mongodb'
import { describe, expect, it } from 'vitest'

import { EJSON } from './index'

/**
 * Models the storage and parent backlinks of hydrated Mongoose documents.
 * The consumer validates this dependency-free fixture against actual models.
 */
class HydratedDocument {
  readonly $__ = { activePaths: {} }
  readonly _doc: Record<string, unknown>
  $__parent?: HydratedDocument

  constructor(data: Record<string, unknown>) {
    this._doc = data
  }
}

class model extends HydratedDocument {}

describe('hydrated document serialization', () => {
  it.each([
    { name: 'model', Document: model },
    { name: 'renamed document', Document: HydratedDocument },
  ])('preserves $name identity after parent backlinks', ({ Document }) => {
    const id = new ObjectId()
    const createdAt = new Date()
    const analytics = new HydratedDocument({ viewCount: 0 })
    const entries = Array.from({ length: 3 }, (_, index) => {
      const entryId = new ObjectId()
      return new HydratedDocument({
        _id: entryId,
        index,
        createdAt: new Date(createdAt.getTime()),
      })
    })
    const document = new Document({
      analytics,
      entries,
      _id: id,
      name: 'Generated document',
      createdAt,
    })
    analytics.$__parent = document
    for (const entry of entries) entry.$__parent = document

    const expected = {
      analytics: { viewCount: 0 },
      entries: entries.map(entry => ({
        _id: String(entry._doc._id),
        index: entry._doc.index,
        createdAt,
      })),
      _id: String(id),
      name: 'Generated document',
      createdAt,
    }

    const encoded = EJSON.stringify(document)
    expect(EJSON.parse(encoded)).toEqual(expected)
    expect(EJSON.clone(document)).toEqual(expected)
    expect(encoded).not.toContain('$__')
    expect(encoded).not.toContain('_doc')
  })

  it('retains ordinary objects containing document-like property names', () => {
    const value = { _doc: { name: 'User content' }, extra: true }
    expect(EJSON.parse(EJSON.stringify(value))).toEqual(value)
  })
})
