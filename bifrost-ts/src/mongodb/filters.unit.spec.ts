import { ObjectId } from 'mongodb'
import { describe, expect, it } from 'vitest'

import { active, markDeleted, markRestored, projection } from './filters'

describe('mongodb filter helpers', () => {
  it('builds explicit active filters', () => {
    const author = new ObjectId()

    expect(active({ author })).toEqual({ author, deletedAt: null })
    expect(() => active({ deletedAt: new Date() })).toThrow(
      'cannot override an explicit deletedAt filter',
    )
  })

  it('builds explicit soft-delete updates', () => {
    const deletedBy = new ObjectId()
    const now = new Date('2026-04-21T00:00:00.000Z')

    expect(markDeleted(deletedBy, { now })).toEqual({
      $set: { deletedAt: now, deletedBy },
    })
    expect(markRestored()).toEqual({
      $unset: { deletedAt: '', deletedBy: '' },
    })
  })

  it('converts projection strings into native projection documents', () => {
    expect(projection('name email  author')).toEqual({
      name: 1,
      email: 1,
      author: 1,
    })
  })
})
