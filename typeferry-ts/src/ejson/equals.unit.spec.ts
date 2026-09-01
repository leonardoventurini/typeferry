import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { EJSON } from './index'
import { equals } from './equals'

describe('equals', () => {
  describe('primitive checks', () => {
    it('returns true for identical references', () => {
      const obj = { a: 1 }
      expect(equals(obj, obj)).toBe(true)
    })

    it('returns true for two NaN values', () => {
      expect(equals(NaN, NaN)).toBe(true)
    })

    it('returns false when one side is falsy and the other is not', () => {
      expect(equals(null, { a: 1 })).toBe(false)
      expect(equals({ a: 1 }, null)).toBe(false)
      expect(equals(undefined, { a: 1 })).toBe(false)
      expect(equals({ a: 1 }, undefined)).toBe(false)
    })

    it('returns false when one side is falsy and both are falsy but different', () => {
      expect(equals(null, undefined)).toBe(false)
      expect(equals(0, false)).toBe(false)
      expect(equals('', false)).toBe(false)
    })

    it('returns false when comparing object to non-object', () => {
      expect(equals({ a: 1 }, 'string')).toBe(false)
      expect(equals(42, { a: 1 })).toBe(false)
    })

    it('returns true for identical primitive values', () => {
      expect(equals(42, 42)).toBe(true)
      expect(equals('hello', 'hello')).toBe(true)
      expect(equals(true, true)).toBe(true)
    })

    it('returns false for different primitive values', () => {
      expect(equals(1, 2)).toBe(false)
      expect(equals('a', 'b')).toBe(false)
    })
  })

  describe('Date equality', () => {
    it('returns true for dates with the same timestamp', () => {
      const d1 = new Date('2024-01-01')
      const d2 = new Date('2024-01-01')
      expect(equals(d1, d2)).toBe(true)
    })

    it('returns false for dates with different timestamps', () => {
      const d1 = new Date('2024-01-01')
      const d2 = new Date('2024-01-02')
      expect(equals(d1, d2)).toBe(false)
    })
  })

  describe('binary equality', () => {
    it('returns true for identical Uint8Array content', () => {
      const a = new Uint8Array([1, 2, 3])
      const b = new Uint8Array([1, 2, 3])
      expect(equals(a, b)).toBe(true)
    })

    it('returns false for different Uint8Array content', () => {
      const a = new Uint8Array([1, 2, 3])
      const b = new Uint8Array([1, 2, 4])
      expect(equals(a, b)).toBe(false)
    })

    it('returns false for different length Uint8Arrays', () => {
      const a = new Uint8Array([1, 2])
      const b = new Uint8Array([1, 2, 3])
      expect(equals(a, b)).toBe(false)
    })
  })

  describe('objects with equals() method', () => {
    it('delegates to a.equals() when a has an equals method', () => {
      const a = {
        value: 42,
        equals: vi.fn().mockReturnValue(true),
      }
      const b = { value: 42 }

      expect(equals(a, b)).toBe(true)
      expect(a.equals).toHaveBeenCalledWith(b, undefined)
    })

    it('delegates to b.equals() when only b has an equals method', () => {
      const a = { value: 42 }
      const b = {
        value: 42,
        equals: vi.fn().mockReturnValue(false),
      }

      expect(equals(a, b)).toBe(false)
      expect(b.equals).toHaveBeenCalledWith(a, undefined)
    })

    it('passes options to the equals method', () => {
      const a = {
        value: 1,
        equals: vi.fn().mockReturnValue(true),
      }
      const b = { value: 1 }
      const opts = { keyOrderSensitive: true }

      equals(a, b, opts)

      expect(a.equals).toHaveBeenCalledWith(b, opts)
    })
  })

  describe('array equality', () => {
    it('returns true for equal arrays', () => {
      expect(equals([1, 2, 3], [1, 2, 3])).toBe(true)
    })

    it('returns false for arrays of different lengths', () => {
      expect(equals([1, 2], [1, 2, 3])).toBe(false)
    })

    it('returns false for arrays with different elements', () => {
      expect(equals([1, 2, 3], [1, 2, 4])).toBe(false)
    })

    it('returns false when one is array and the other is not', () => {
      expect(equals([1, 2], { 0: 1, 1: 2 })).toBe(false)
      expect(equals({ 0: 1, 1: 2 }, [1, 2])).toBe(false)
    })

    it('handles nested arrays recursively', () => {
      expect(equals([[1, 2], [3]], [[1, 2], [3]])).toBe(true)
      expect(equals([[1, 2], [3]], [[1, 2], [4]])).toBe(false)
    })
  })

  describe('custom EJSON types', () => {
    afterEach(() => {
      // Clean up any registered custom types
      const types = EJSON._getTypes(true) as Map<string, any>
      types.delete('TestType')
    })

    it('returns false when only one is a custom type', () => {
      EJSON.addType('TestType', (val) => ({ typeName: () => 'TestType', toJSONValue: () => val }))

      const custom = {
        typeName: () => 'TestType',
        toJSONValue: () => ({ v: 1 }),
      }
      const plain = { v: 1 }

      expect(equals(custom, plain)).toBe(false)
    })

    it('compares two custom types by their JSON values', () => {
      EJSON.addType('TestType', (val) => ({
        typeName: () => 'TestType',
        toJSONValue: () => val,
      }))

      const a = {
        typeName: () => 'TestType',
        toJSONValue: () => ({ v: 1 }),
      }
      const b = {
        typeName: () => 'TestType',
        toJSONValue: () => ({ v: 1 }),
      }

      expect(equals(a, b)).toBe(true)
    })

    it('returns false for custom types with different values', () => {
      EJSON.addType('TestType', (val) => ({
        typeName: () => 'TestType',
        toJSONValue: () => val,
      }))

      const a = {
        typeName: () => 'TestType',
        toJSONValue: () => ({ v: 1 }),
      }
      const b = {
        typeName: () => 'TestType',
        toJSONValue: () => ({ v: 2 }),
      }

      expect(equals(a, b)).toBe(false)
    })
  })

  describe('object key comparison', () => {
    it('returns true for objects with same keys and values (unordered)', () => {
      expect(equals({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    })

    it('returns false when keys differ', () => {
      expect(equals({ a: 1 }, { b: 1 })).toBe(false)
    })

    it('returns false when key counts differ', () => {
      expect(equals({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    })

    it('compares keys in order when keyOrderSensitive is true', () => {
      expect(
        equals({ a: 1, b: 2 }, { a: 1, b: 2 }, { keyOrderSensitive: true }),
      ).toBe(true)
    })

    it('returns false for different key order when keyOrderSensitive is true', () => {
      expect(
        equals({ a: 1, b: 2 }, { b: 2, a: 1 }, { keyOrderSensitive: true }),
      ).toBe(false)
    })

    it('handles key order sensitivity when bKeys is shorter', () => {
      expect(
        equals(
          { a: 1, b: 2, c: 3 },
          { a: 1, b: 2 },
          { keyOrderSensitive: true },
        ),
      ).toBe(false)
    })

    it('handles key order sensitivity when bKeys is longer', () => {
      expect(
        equals(
          { a: 1 },
          { a: 1, b: 2 },
          { keyOrderSensitive: true },
        ),
      ).toBe(false)
    })
  })

  describe('nested / complex objects', () => {
    it('recursively compares nested objects', () => {
      expect(
        equals({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } }),
      ).toBe(true)
    })

    it('returns false for nested differences', () => {
      expect(
        equals({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } }),
      ).toBe(false)
    })

    it('handles mixed nested types', () => {
      expect(
        equals(
          { a: [1, { b: 2 }], c: new Date('2024-01-01') },
          { a: [1, { b: 2 }], c: new Date('2024-01-01') },
        ),
      ).toBe(true)
    })
  })
})
