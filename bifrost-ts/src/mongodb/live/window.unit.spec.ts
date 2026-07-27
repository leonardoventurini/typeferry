import type { Document } from 'mongodb'
import { describe, expect, it } from 'vitest'

import {
  applyMongoLiveWindowSplice,
  createMongoLiveWindowSplice,
  normalizeMongoLiveWindow,
} from './window'

interface Item extends Document {
  readonly _id: string
  readonly score: number
  readonly label: string
}

describe('MongoDB live ordered windows', () => {
  it('validates bounds and appends the stable identity tie-breaker', () => {
    expect(
      normalizeMongoLiveWindow(
        {
          sort: { score: -1 },
          skip: 4,
          limit: 10,
        },
        20,
        100,
      ),
    ).toEqual({
      sort: [
        ['score', -1],
        ['_id', 1],
      ],
      skip: 4,
      limit: 10,
    })

    expect(() =>
      normalizeMongoLiveWindow(
        { sort: { score: 1 }, skip: -1, limit: 1 },
        20,
        100,
      ),
    ).toThrow('non-negative integer')
    expect(() =>
      normalizeMongoLiveWindow(
        { sort: { score: 1 }, limit: 21 },
        20,
        100,
      ),
    ).toThrow('exceeds 20')
    expect(() =>
      normalizeMongoLiveWindow(
        { sort: { score: 2 as 1 }, limit: 1 },
        20,
        100,
      ),
    ).toThrow('must be 1 or -1')
  })

  it('derives an atomic splice whose application equals the new window', () => {
    const previous = [
      item('a', 10, 'A'),
      item('b', 20, 'B'),
      item('c', 30, 'C'),
    ]
    const current = [
      item('a', 10, 'A'),
      item('x', 15, 'X'),
      item('b', 20, 'B updated'),
    ]

    const operation = createMongoLiveWindowSplice(previous, current)

    expect(operation).toEqual({
      type: 'window-splice',
      index: 1,
      deleteCount: 2,
      documents: current.slice(1),
    })
    expect(
      operation && applyMongoLiveWindowSplice(previous, operation),
    ).toEqual(current)
    expect(createMongoLiveWindowSplice(current, current)).toBeNull()
  })

  it('rejects corrupt indices and duplicate resulting identities', () => {
    const previous = [item('a', 10, 'A'), item('b', 20, 'B')]

    expect(
      applyMongoLiveWindowSplice(previous, {
        type: 'window-splice',
        index: 3,
        deleteCount: 0,
        documents: [],
      }),
    ).toBeNull()
    expect(
      applyMongoLiveWindowSplice(previous, {
        type: 'window-splice',
        index: 1,
        deleteCount: 0,
        documents: [item('a', 30, 'duplicate')],
      }),
    ).toBeNull()
  })

  it('keeps ObjectId and equal-looking native string identities distinct', () => {
    const hexadecimal = '64b000000000000000000001'
    const applied = applyMongoLiveWindowSplice([], {
      type: 'window-splice',
      index: 0,
      deleteCount: 0,
      documents: [
        { _id: { $objectId: hexadecimal }, score: 1, label: 'ObjectId' },
        { _id: hexadecimal, score: 2, label: 'String' },
      ],
    })

    expect(applied).toHaveLength(2)
  })
})

function item(_id: string, score: number, label: string): Item {
  return { _id, score, label }
}
