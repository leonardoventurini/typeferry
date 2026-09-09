import { describe, expect, it } from 'vitest'

import { LocalCollection } from './local-collection'
import { Matcher } from './matcher'
import { modifyDocument } from './modifier'
import { Sorter } from './sorter'

interface CorpusDocument extends Record<string, unknown> {
  _id: string
}

function matches(selector: unknown, document: Record<string, unknown>): boolean {
  return new Matcher(selector).documentMatches(document).result
}

describe('Meteor 3.5.2 compatibility corpus', () => {
  it('evaluates procedurally generated scalar and array equality cases', () => {
    for (let value = -3; value <= 3; value += 1) {
      expect(matches({ value }, { value })).toBe(true)
      expect(matches({ value }, { value: [value - 1, value, value + 1] })).toBe(true)
      expect(matches({ value }, { value: value + 1 })).toBe(false)
    }

    expect(matches({ value: null }, {})).toBe(true)
    expect(matches({ value: [1, 2] }, { value: [[1, 2]] })).toBe(true)
    expect(matches({ value: { a: 1, b: 2 } }, { value: { b: 2, a: 1 } })).toBe(false)
  })

  it('covers comparison, membership, array, regex, and logical selectors', () => {
    const document = {
      value: 10,
      values: [8, 10, 12],
      labels: ['Alpha', 'beta'],
      rows: [{ score: 1 }, { score: 5 }],
    }
    const positive: unknown[] = [
      { value: { $gte: 10, $lt: 11 } },
      { values: { $gt: 11, $lt: 9 } },
      { labels: { $in: [/pha$/, 'other'] } },
      { labels: { $nin: ['missing'] } },
      { labels: { $all: [/alp/i, /^beta$/] } },
      { labels: { $size: 2 } },
      { rows: { $elemMatch: { score: { $gt: 3 } } } },
      { missing: { $exists: false } },
      { $and: [{ value: 10 }, { $nor: [{ value: 11 }] }] },
    ]
    const negative: unknown[] = [
      { value: { $ne: 10 } },
      { labels: { $all: ['Alpha', 'missing'] } },
      { labels: { $size: 1 } },
      { rows: { $elemMatch: { score: { $gt: 8 } } } },
      { missing: { $exists: true } },
      { $or: [{ value: 9 }, { value: 11 }] },
    ]

    for (const selector of positive) expect(matches(selector, document), JSON.stringify(selector)).toBe(true)
    for (const selector of negative) expect(matches(selector, document), JSON.stringify(selector)).toBe(false)
  })

  it('covers BSON type, bitmask, collation, and geospatial selectors', () => {
    expect(matches({ value: { $type: 'double' } }, { value: 3 })).toBe(true)
    expect(matches({ value: { $type: 2 } }, { value: 'three' })).toBe(true)
    expect(matches({ value: { $bitsAllSet: [0, 2] } }, { value: 5 })).toBe(true)
    expect(matches({ value: { $bitsAnySet: [0, 1] } }, { value: 1 })).toBe(true)
    expect(matches({ value: { $bitsAllClear: [1, 3] } }, { value: 5 })).toBe(true)
    expect(new Matcher({ name: 'ALPHA' }, false, { locale: 'en', strength: 1 })
      .documentMatches({ name: 'alpha' }).result).toBe(true)

    const near = new Matcher({ location: { $near: [0, 0], $maxDistance: 3 } })
    expect(near.documentMatches({ location: [[5, 5], [2, 0]] })).toEqual({
      result: true,
      distance: 2,
      arrayIndices: [1],
    })
    expect(near.documentMatches({ location: [4, 0] }).result).toBe(false)
  })

  it('matches exact rejection behavior for malformed selector operands', () => {
    for (const selector of [
      { $and: [] },
      { $or: 'invalid' },
      { value: { $type: 0 } },
      { value: { $type: 20 } },
      { value: { $elemMatch: 1 } },
      { value: { $regex: /x/, $options: 's' } },
      { value: { $bitsAllSet: 0x80000000 } },
    ]) {
      expect(() => new Matcher(selector), JSON.stringify(selector)).toThrow()
    }
    expect(matches({ value: /x/ }, { value: /x/ })).toBe(true)
    expect(matches({ value: /x/ }, { value: /x/i })).toBe(false)
    expect(matches({ value: { $type: 4 } }, { value: [[]] })).toBe(true)
    expect(matches({ value: { $type: 4 } }, { value: [] })).toBe(false)
  })

  it('preserves positional metadata through single-or and conjunction selectors', () => {
    const document = { rows: [{ score: 1 }, { score: 5 }] }

    expect(new Matcher({ $or: [{ rows: { $elemMatch: { score: 5 } } }] })
      .documentMatches(document).arrayIndices).toEqual([1])
    expect(new Matcher({ $and: [{ rows: { $elemMatch: { score: 5 } } }, { rows: { $exists: true } }] })
      .documentMatches(document).arrayIndices).toEqual([1])
  })

  it('sorts scalar, array, nested, function, and collated values', () => {
    const documents = [
      { _id: 'a', score: [8, 2], nested: { name: 'Zulu' } },
      { _id: 'b', score: [3, 9], nested: { name: 'alpha' } },
      { _id: 'c', score: [4], nested: { name: 'Bravo' } },
    ]

    expect([...documents].sort(new Sorter({ score: 1 }).getComparator()).map(value => value._id))
      .toEqual(['a', 'b', 'c'])
    expect([...documents].sort(new Sorter({ score: -1 }).getComparator()).map(value => value._id))
      .toEqual(['b', 'a', 'c'])
    expect([...documents].sort(new Sorter({ 'nested.name': 1 }, { locale: 'en', strength: 1 })
      .getComparator()).map(value => value._id)).toEqual(['b', 'c', 'a'])
    expect([...documents].sort(new Sorter<typeof documents[number]>((left, right) =>
      right._id.localeCompare(left._id)).getComparator()).map(value => value._id)).toEqual(['c', 'b', 'a'])
  })

  it('covers every supported mutation operator in deterministic batches', () => {
    const document: CorpusDocument = {
      _id: 'one',
      count: 4,
      minimum: 5,
      maximum: 5,
      multiplied: 3,
      tags: ['a', 'b'],
      queue: [1, 2, 3],
      obsolete: true,
      source: 'moved',
    }
    modifyDocument(document, {
      $inc: { count: 2 },
      $min: { minimum: 3 },
      $max: { maximum: 8 },
      $mul: { multiplied: 4 },
      $unset: { obsolete: true },
      $rename: { source: 'destination' },
      $push: { queue: { $each: [4, 5], $position: 1, $slice: -4 } },
      $addToSet: { tags: { $each: ['b', 'c'] } },
      $currentDate: { touchedAt: true },
    } as never, { now: () => new Date(1234) })
    modifyDocument(document, {
      $pop: { queue: -1 },
      $pull: { tags: 'a' },
      $pushAll: { tags: ['d', 'e'] },
      $pullAll: { tags: ['d'] },
    } as never)

    expect(document).toEqual({
      _id: 'one',
      count: 6,
      minimum: 3,
      maximum: 8,
      multiplied: 12,
      tags: ['b', 'c', 'e'],
      queue: [5, 2, 3],
      destination: 'moved',
      touchedAt: new Date(1234),
    })
  })

  it('preserves operation-sequence results across sync and async APIs', async () => {
    const collection = new LocalCollection<{ group: number; value: number }, string>()
    for (let value = 0; value < 10; value += 1) {
      collection.insert({ _id: String(value), group: value % 2, value })
    }

    expect(collection.update({ group: 0 }, { $inc: { value: 10 } }, { multi: true })).toBe(5)
    expect(await collection.removeAsync({ value: { $gt: 15 } })).toBe(2)
    expect(collection.find({}, { sort: { value: 1 }, skip: 2, limit: 3 })
      .map(document => document.value)).toEqual([5, 7, 9])
    expect(await collection.countDocuments({ group: 0 })).toBe(3)
  })
})
