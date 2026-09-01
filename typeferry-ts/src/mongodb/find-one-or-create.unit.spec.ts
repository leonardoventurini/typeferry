import type { Collection } from 'mongodb'
import { ObjectId } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'

import { findOneOrCreate } from './find-one-or-create'

interface Board {
  _id: ObjectId
  name: string
}

describe('findOneOrCreate', () => {
  it('uses an atomic upsert and returns the resulting document', async () => {
    const board = { _id: new ObjectId(), name: 'Roadmap' }
    const findOneAndUpdate = vi.fn().mockResolvedValue(board)
    const collection = {
      findOneAndUpdate,
    } as unknown as Collection<Board>

    await expect(
      findOneOrCreate(collection, { name: 'Roadmap' }, board),
    ).resolves.toEqual(board)

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { name: 'Roadmap' },
      { $setOnInsert: board },
      { upsert: true, returnDocument: 'after', session: undefined },
    )
  })

  it('throws if MongoDB does not return a document', async () => {
    const collection = {
      findOneAndUpdate: vi.fn().mockResolvedValue(null),
    } as unknown as Collection<Board>

    await expect(
      findOneOrCreate(collection, { name: 'Roadmap' }, {
        _id: new ObjectId(),
        name: 'Roadmap',
      }),
    ).rejects.toThrow('failed to return an upserted document')
  })
})
