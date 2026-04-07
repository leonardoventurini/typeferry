import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { builtinConverters } from './built-in-converters'
import { EJSON } from './index'

describe('builtinConverters', () => {
  // Helper to find a converter by what it matches
  const findConverter = (matchFn: string, testObj: any) =>
    builtinConverters.find((c) => c[matchFn](testObj))

  describe('Date converter', () => {
    const dateConverter = builtinConverters[0]

    it('matchJSONValue matches {$date: ...}', () => {
      expect(dateConverter.matchJSONValue({ $date: 1234567890 })).toBe(true)
    })

    it('matchJSONValue rejects objects with extra keys', () => {
      expect(dateConverter.matchJSONValue({ $date: 123, extra: true })).toBe(
        false,
      )
    })

    it('matchObject matches Date instances', () => {
      expect(dateConverter.matchObject(new Date())).toBe(true)
    })

    it('matchObject rejects non-Date objects', () => {
      expect(dateConverter.matchObject({})).toBe(false)
    })

    it('round-trips a Date via toJSONValue/fromJSONValue', () => {
      const date = new Date('2024-06-15T12:00:00Z')
      const json = dateConverter.toJSONValue(date)
      expect(json).toEqual({ $date: date.getTime() })
      const restored = dateConverter.fromJSONValue(json)
      expect(restored).toEqual(date)
    })
  })

  describe('RegExp converter', () => {
    const regexpConverter = builtinConverters[1]

    it('matchJSONValue matches {$regexp: ..., $flags: ...}', () => {
      expect(
        regexpConverter.matchJSONValue({ $regexp: 'test', $flags: 'gi' }),
      ).toBe(true)
    })

    it('matchJSONValue rejects objects with wrong keys', () => {
      expect(regexpConverter.matchJSONValue({ $regexp: 'test' })).toBe(false)
    })

    it('matchObject matches RegExp instances', () => {
      expect(regexpConverter.matchObject(/test/)).toBe(true)
    })

    it('round-trips a RegExp via toJSONValue/fromJSONValue', () => {
      const re = /foo/gi
      const json = regexpConverter.toJSONValue(re)
      expect(json).toEqual({ $regexp: 'foo', $flags: 'gi' })
      const restored = regexpConverter.fromJSONValue(json)
      expect(restored.source).toBe('foo')
      expect(restored.flags).toBe('gi')
    })

    it('strips invalid flags from $flags', () => {
      const json = { $regexp: 'test', $flags: 'gxzimu' }
      const restored = regexpConverter.fromJSONValue(json)
      // Only valid flags should remain: g, i, m, u (x and z are invalid)
      expect(restored.flags).toMatch(/^[gimuy]+$/)
    })

    it('removes duplicate flags', () => {
      const json = { $regexp: 'test', $flags: 'ggii' }
      const restored = regexpConverter.fromJSONValue(json)
      expect(restored.flags.split('').sort().join('')).toBe('gi')
    })

    it('truncates overly long flag strings', () => {
      const longFlags = 'g'.repeat(100)
      const json = { $regexp: 'test', $flags: longFlags }
      const restored = regexpConverter.fromJSONValue(json)
      // Should have been sliced to 50 then deduped
      expect(restored.flags).toBe('g')
    })
  })

  describe('InfNaN converter', () => {
    const infNaNConverter = builtinConverters[2]

    it('matchJSONValue matches {$InfNaN: ...}', () => {
      expect(infNaNConverter.matchJSONValue({ $InfNaN: 0 })).toBe(true)
    })

    it('matchObject matches NaN', () => {
      expect(infNaNConverter.matchObject(NaN)).toBe(true)
    })

    it('matchObject matches Infinity', () => {
      expect(infNaNConverter.matchObject(Infinity)).toBe(true)
    })

    it('matchObject matches -Infinity', () => {
      expect(infNaNConverter.matchObject(-Infinity)).toBe(true)
    })

    it('matchObject rejects normal numbers', () => {
      expect(infNaNConverter.matchObject(42)).toBe(false)
    })

    it('toJSONValue encodes NaN as 0', () => {
      expect(infNaNConverter.toJSONValue(NaN)).toEqual({ $InfNaN: 0 })
    })

    it('toJSONValue encodes Infinity as 1', () => {
      expect(infNaNConverter.toJSONValue(Infinity)).toEqual({ $InfNaN: 1 })
    })

    it('toJSONValue encodes -Infinity as -1', () => {
      expect(infNaNConverter.toJSONValue(-Infinity)).toEqual({ $InfNaN: -1 })
    })

    it('fromJSONValue decodes 0 to NaN', () => {
      expect(infNaNConverter.fromJSONValue({ $InfNaN: 0 })).toBeNaN()
    })

    it('fromJSONValue decodes 1 to Infinity', () => {
      expect(infNaNConverter.fromJSONValue({ $InfNaN: 1 })).toBe(Infinity)
    })

    it('fromJSONValue decodes -1 to -Infinity', () => {
      expect(infNaNConverter.fromJSONValue({ $InfNaN: -1 })).toBe(-Infinity)
    })
  })

  describe('Binary converter', () => {
    const binaryConverter = builtinConverters[3]

    it('matchJSONValue matches {$binary: ...}', () => {
      expect(binaryConverter.matchJSONValue({ $binary: 'AAAA' })).toBe(true)
    })

    it('matchJSONValue rejects objects with extra keys', () => {
      expect(
        binaryConverter.matchJSONValue({ $binary: 'AAAA', extra: true }),
      ).toBe(false)
    })

    it('matchObject matches Uint8Array', () => {
      expect(binaryConverter.matchObject(new Uint8Array([1, 2, 3]))).toBe(true)
    })

    it('matchObject matches polyfilled binary', () => {
      const polyfill = [1, 2, 3] as any
      polyfill.$Uint8ArrayPolyfill = true
      expect(binaryConverter.matchObject(polyfill)).toBe(true)
    })

    it('matchObject rejects plain arrays', () => {
      expect(binaryConverter.matchObject([1, 2, 3])).toBe(false)
    })

    it('round-trips binary data via toJSONValue/fromJSONValue', () => {
      const buf = new Uint8Array([10, 20, 30, 40])
      const json = binaryConverter.toJSONValue(buf)
      expect(json).toHaveProperty('$binary')
      const restored = binaryConverter.fromJSONValue(json)
      expect(restored).toEqual(new Uint8Array([10, 20, 30, 40]))
    })
  })

  describe('Escape converter', () => {
    const escapeConverter = builtinConverters[4]

    it('matchJSONValue matches {$escape: ...}', () => {
      expect(escapeConverter.matchJSONValue({ $escape: {} })).toBe(true)
    })

    it('matchObject matches objects that look like EJSON JSON values', () => {
      // An object with {$date: ...} should need escaping
      expect(escapeConverter.matchObject({ $date: 12345 })).toBe(true)
    })

    it('matchObject does not match objects with more than 2 keys', () => {
      expect(
        escapeConverter.matchObject({ $date: 1, $extra: 2, $third: 3 }),
      ).toBe(false)
    })

    it('matchObject does not match null', () => {
      expect(escapeConverter.matchObject(null)).toBe(false)
    })

    it('matchObject does not match empty objects', () => {
      expect(escapeConverter.matchObject({})).toBe(false)
    })

    it('round-trips escaped objects', () => {
      const obj = { $date: 12345 }
      const json = escapeConverter.toJSONValue(obj)
      expect(json).toHaveProperty('$escape')
      const restored = escapeConverter.fromJSONValue(json)
      expect(restored).toEqual({ $date: 12345 })
    })
  })

  describe('Custom type converter', () => {
    const customConverter = builtinConverters[5]

    afterEach(() => {
      const types = EJSON._getTypes(true) as Map<string, any>
      types.delete('ConverterTestType')
    })

    it('matchJSONValue matches {$type: ..., $value: ...}', () => {
      expect(
        customConverter.matchJSONValue({ $type: 'Foo', $value: {} }),
      ).toBe(true)
    })

    it('matchJSONValue rejects objects missing $value', () => {
      expect(customConverter.matchJSONValue({ $type: 'Foo' })).toBe(false)
    })

    it('matchObject matches custom EJSON types', () => {
      EJSON.addType('ConverterTestType', (val) => ({
        typeName: () => 'ConverterTestType',
        toJSONValue: () => val,
      }))

      const obj = {
        typeName: () => 'ConverterTestType',
        toJSONValue: () => ({ v: 1 }),
      }
      expect(customConverter.matchObject(obj)).toBe(true)
    })

    it('toJSONValue serializes custom type', () => {
      const obj = {
        typeName: () => 'MyType',
        toJSONValue: () => ({ val: 42 }),
      }
      const json = customConverter.toJSONValue(obj)
      expect(json).toEqual({ $type: 'MyType', $value: { val: 42 } })
    })

    it('fromJSONValue deserializes using registered factory', () => {
      const factory = vi.fn((val) => ({
        typeName: () => 'ConverterTestType',
        toJSONValue: () => val,
        restored: true,
        data: val,
      }))
      EJSON.addType('ConverterTestType', factory)

      const result = customConverter.fromJSONValue({
        $type: 'ConverterTestType',
        $value: { data: 'hello' },
      })

      expect(factory).toHaveBeenCalledWith({ data: 'hello' })
      expect(result.restored).toBe(true)
    })

    it('throws when deserializing an unregistered custom type', () => {
      expect(() =>
        customConverter.fromJSONValue({
          $type: 'UnregisteredType',
          $value: {},
        }),
      ).toThrow('Custom EJSON type UnregisteredType is not defined')
    })
  })
})
