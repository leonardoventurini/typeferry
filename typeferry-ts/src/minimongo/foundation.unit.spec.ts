import { describe, expect, it } from 'vitest'

import { MemoryDocumentStore } from './document-store'
import { meteorIdentityCodec } from './identity'
import { ObjectID } from './object-id'
import { meteorValueSemantics } from './value-semantics'

describe('Minimongo foundation', () => {
  it('normalizes and clones Meteor ObjectIDs', () => {
    const objectId = new ObjectID('ABCDEFABCDEFABCDEFABCDEF')
    const clone = objectId.clone()

    expect(objectId.toHexString()).toBe('abcdefabcdefabcdefabcdef')
    expect(objectId.toString()).toBe('ObjectID("abcdefabcdefabcdefabcdef")')
    expect(clone).not.toBe(objectId)
    expect(clone.equals(objectId)).toBe(true)
    expect(() => new ObjectID('invalid')).toThrow(
      'Invalid hexadecimal string for creating an ObjectID',
    )
  })

  it('keeps ObjectID-shaped strings in a separate identity namespace', () => {
    const hex = 'abcdefabcdefabcdefabcdef'
    const objectIdKey = meteorIdentityCodec.stringify(new ObjectID(hex))
    const stringKey = meteorIdentityCodec.stringify(hex)

    expect(objectIdKey).toBe(hex)
    expect(stringKey).toBe(`-${hex}`)
    expect(meteorIdentityCodec.parse(objectIdKey)).toBeInstanceOf(ObjectID)
    expect(meteorIdentityCodec.parse(stringKey)).toBe(hex)
  })

  it('deep-clones supported values and compares object key order on demand', () => {
    const source = {
      date: new Date(1234),
      id: new ObjectID('1234567890abcdef12345678'),
      nested: [{ value: Number.NaN }],
    }
    const clone = meteorValueSemantics.clone(source)

    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    expect(clone.date).not.toBe(source.date)
    expect(clone.id).not.toBe(source.id)
    expect(meteorValueSemantics.equals({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(
      meteorValueSemantics.equals(
        { a: 1, b: 2 },
        { b: 2, a: 1 },
        { keyOrderSensitive: true },
      ),
    ).toBe(false)
  })

  it('preserves natural insertion order and clones stored documents', () => {
    const store = new MemoryDocumentStore<string, { value: number }>(
      meteorIdentityCodec,
      meteorValueSemantics,
    )

    store.set('second', { value: 2 })
    store.set('first', { value: 1 })
    const clone = store.clone()
    const clonedSecond = clone.get('second')
    if (clonedSecond) clonedSecond.value = 3

    expect([...store.entries()].map(([id]) => id)).toEqual(['second', 'first'])
    expect(store.get('second')).toEqual({ value: 2 })
    expect(clone.get('second')).toEqual({ value: 3 })
  })
})

