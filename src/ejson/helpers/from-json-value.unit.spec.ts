import { describe, expect, it } from 'vitest'

import { fromJSONValueHelper } from './from-json-value-helper'

describe('fromJSONValueHelper', () => {
  it('returns Date for $date object', () => {
    const result = fromJSONValueHelper({ $date: 1000 })
    expect(result).toBeInstanceOf(Date)
    expect((result as Date).getTime()).toBe(1000)
  })

  it('returns the original value for non-objects', () => {
    expect(fromJSONValueHelper(42)).toBe(42)
    expect(fromJSONValueHelper('hello')).toBe('hello')
    expect(fromJSONValueHelper(null)).toBe(null)
    expect(fromJSONValueHelper(undefined)).toBe(undefined)
    expect(fromJSONValueHelper(true)).toBe(true)
  })

  it('returns the value unchanged when keys start with $ but no converter matches (line 15)', () => {
    // Object with $-prefixed keys that don't match any built-in converter
    const value = { $unknownType: 'some value' }
    const result = fromJSONValueHelper(value)
    // No converter matches, so the original value is returned
    expect(result).toBe(value)
  })

  it('returns the value unchanged for a 2-key $-prefixed object with no converter match', () => {
    const value = { $foo: 1, $bar: 2 }
    const result = fromJSONValueHelper(value)
    expect(result).toBe(value)
  })

  it('returns the value unchanged when object has more than 2 keys', () => {
    const value = { $date: 1000, $extra: true, $another: false }
    const result = fromJSONValueHelper(value)
    // More than 2 keys, so the condition fails and value is returned
    expect(result).toBe(value)
  })

  it('returns the value unchanged when keys do not start with $', () => {
    const value = { name: 'test', count: 5 }
    const result = fromJSONValueHelper(value)
    expect(result).toBe(value)
  })

  it('returns the value unchanged for an empty object', () => {
    const value = {}
    const result = fromJSONValueHelper(value)
    expect(result).toBe(value)
  })
})
