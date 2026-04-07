import { describe, expect, it } from 'vitest'

import { adjustTypesFromJSONValue } from './adjust-types-from-json-value'

describe('adjustTypesFromJSONValue', () => {
  it('returns null for null input', () => {
    expect(adjustTypesFromJSONValue(null)).toBe(null)
  })

  it('converts a $date object to a Date instance (line 15 - maybeChanged !== obj)', () => {
    const result = adjustTypesFromJSONValue({ $date: 1000 })
    expect(result).toBeInstanceOf(Date)
    expect((result as Date).getTime()).toBe(1000)
  })

  it('returns atoms unchanged (line 21 - non-object path)', () => {
    expect(adjustTypesFromJSONValue(42)).toBe(42)
    expect(adjustTypesFromJSONValue('hello')).toBe('hello')
    expect(adjustTypesFromJSONValue(true)).toBe(true)
    expect(adjustTypesFromJSONValue(undefined)).toBe(undefined)
  })

  it('recursively adjusts nested $date objects', () => {
    const obj = { created: { $date: 2000 }, name: 'test' }
    const result = adjustTypesFromJSONValue(obj)

    expect(result.created).toBeInstanceOf(Date)
    expect((result.created as Date).getTime()).toBe(2000)
    expect(result.name).toBe('test')
  })

  it('recursively adjusts deeply nested objects', () => {
    const obj = {
      level1: {
        level2: {
          ts: { $date: 3000 },
        },
      },
    }

    const result = adjustTypesFromJSONValue(obj)
    expect(result.level1.level2.ts).toBeInstanceOf(Date)
  })

  it('returns the same object reference for plain objects', () => {
    const obj = { a: 1, b: 'two' }
    const result = adjustTypesFromJSONValue(obj)
    expect(result).toBe(obj)
  })

  it('replaces nested values in-place when converter matches', () => {
    const obj = { data: { $InfNaN: 1 } }
    adjustTypesFromJSONValue(obj)
    expect(obj.data).toBe(Infinity)
  })
})
