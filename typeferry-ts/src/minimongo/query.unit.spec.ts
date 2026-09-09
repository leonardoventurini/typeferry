import { describe, expect, it } from 'vitest'

import { MiniMongoQueryError } from './errors'
import { Matcher } from './matcher'
import { compileProjection } from './projection'
import { Sorter } from './sorter'

interface TestDocument {
  _id: string
  name: string
  score: number
  nested?: { value: number }
  tags: string[]
  rows?: { value: number }[]
}

const documents: TestDocument[] = [
  { _id: 'a', name: 'Zulu', score: 3, nested: { value: 4 }, tags: ['red', 'blue'] },
  { _id: 'b', name: 'alpha', score: 1, tags: ['green'], rows: [{ value: 2 }, { value: 8 }] },
  { _id: 'c', name: 'Bravo', score: 2, tags: [] },
]

describe('Matcher', () => {
  it('matches scalar IDs, nested paths, arrays, and logical operators', () => {
    expect(new Matcher<TestDocument>('a').documentMatches(documents[0]!).result).toBe(true)
    expect(new Matcher<TestDocument>({ 'nested.value': { $gte: 4 } }).documentMatches(documents[0]!).result).toBe(true)
    expect(new Matcher<TestDocument>({ tags: 'blue' }).documentMatches(documents[0]!).result).toBe(true)
    expect(new Matcher<TestDocument>({ 'rows.value': 8 }).documentMatches(documents[1]!).result).toBe(true)
    expect(new Matcher<TestDocument>({ $or: [{ score: 9 }, { name: /^Bra/ }] }).documentMatches(documents[2]!).result).toBe(true)
  })

  it('supports inclusion, array, type, bit, and elemMatch operators', () => {
    expect(new Matcher({ tags: { $all: ['red', /^bl/] } }).documentMatches(documents[0]!).result).toBe(true)
    expect(new Matcher({ rows: { $elemMatch: { value: { $gt: 5 } } } }).documentMatches(documents[1]!).arrayIndices).toEqual([1])
    expect(new Matcher({ score: { $type: 'double', $in: [1, 2] } }).documentMatches(documents[1]!).result).toBe(true)
    expect(new Matcher({ score: { $bitsAllSet: [0] } }).documentMatches(documents[1]!).result).toBe(true)
  })

  it('preserves safe falsey selectors and query errors', () => {
    expect(new Matcher(undefined).documentMatches(documents[0]!).result).toBe(false)
    expect(new Matcher({ _id: '' }).documentMatches(documents[0]!).result).toBe(false)
    expect(() => new Matcher({ score: { $in: 1 } })).toThrow('$in needs an array')
    expect(() => new Matcher({ $unknown: true })).toThrow(MiniMongoQueryError)
  })

  it('gates string-valued javascript where selectors', () => {
    expect(() => new Matcher({ $where: 'obj.score === 3' })).toThrow(
      '$where must be a function unless allowJavascriptWhere is enabled',
    )
    expect(new Matcher({ $where: 'obj.score === 3' }, false, undefined, undefined, true)
      .documentMatches(documents[0]!).result).toBe(true)
  })
})

describe('Sorter and projection', () => {
  it('sorts by multiple fields and supports collation', () => {
    const byScore = new Sorter<TestDocument>({ score: 1 }).getComparator()
    expect([...documents].sort(byScore).map(document => document._id)).toEqual(['b', 'c', 'a'])

    const byName = new Sorter<TestDocument>({ name: 1 }, { locale: 'en', strength: 2 }).getComparator()
    expect([...documents].sort(byName).map(document => document._id)).toEqual(['b', 'c', 'a'])
  })

  it('projects included and excluded nested fields without aliasing', () => {
    const include = compileProjection<TestDocument>({ name: 1, 'nested.value': 1 })
    const exclude = compileProjection<TestDocument>({ score: 0 })
    const included = include(documents[0]!)

    expect(included).toEqual({ _id: 'a', name: 'Zulu', nested: { value: 4 } })
    expect(included.nested).not.toBe(documents[0]!.nested)
    expect(exclude(documents[0]!)).not.toHaveProperty('score')
    expect(() => compileProjection({ name: 1, score: 0 })).toThrow(
      'You cannot currently mix including and excluding fields.',
    )
  })
})
