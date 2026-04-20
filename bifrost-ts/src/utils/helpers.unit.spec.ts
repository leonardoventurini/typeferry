import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Helpers } from './helpers'

describe('Helpers', () => {
  describe('isSecure', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('returns true when protocol is https:', () => {
      vi.stubGlobal('window', {})
      vi.stubGlobal('document', {
        location: { protocol: 'https:' },
      })

      expect(Helpers.isSecure()).toBe(true)
    })

    it('returns false when protocol is http:', () => {
      vi.stubGlobal('window', {})
      vi.stubGlobal('document', {
        location: { protocol: 'http:' },
      })

      expect(Helpers.isSecure()).toBe(false)
    })

    it('returns false when window is not an object', () => {
      vi.stubGlobal('window', undefined)

      expect(Helpers.isSecure()).toBe(false)
    })

    it('returns false when document.location is undefined', () => {
      vi.stubGlobal('window', {})
      vi.stubGlobal('document', {})

      expect(Helpers.isSecure()).toBe(false)
    })
  })

  describe('extend', () => {
    it('copies functions from source to target', () => {
      const target: Record<string, any> = { name: 'target' }
      const source = {
        greet() {
          return `Hello from ${this.name}`
        },
      }

      Helpers.extend(target, source)

      expect(typeof target.greet).toBe('function')
    })

    it('binds functions to the target object', () => {
      const target: Record<string, any> = { name: 'target' }
      const source = {
        getName() {
          return this.name
        },
      }

      Helpers.extend(target, source)

      expect(target.getName()).toBe('target')
    })

    it('handles multiple functions in source', () => {
      const target: Record<string, any> = { value: 42 }
      const source = {
        getValue() {
          return this.value
        },
        doubleValue() {
          return this.value * 2
        },
      }

      Helpers.extend(target, source)

      expect(target.getValue()).toBe(42)
      expect(target.doubleValue()).toBe(84)
    })

    it('binds remain stable even when detached from target', () => {
      const target: Record<string, any> = { x: 10 }
      const source = {
        getX() {
          return this.x
        },
      }

      Helpers.extend(target, source)
      const detached = target.getX
      expect(detached()).toBe(10)
    })
  })

  describe('getCircularReplacer', () => {
    it('handles non-circular objects normally', () => {
      const replacer = Helpers.getCircularReplacer()
      const obj = { a: 1, b: { c: 2 } }

      const result = JSON.stringify(obj, replacer)
      expect(JSON.parse(result)).toEqual(obj)
    })

    it('removes circular references', () => {
      const replacer = Helpers.getCircularReplacer()
      const obj: any = { a: 1 }
      obj.self = obj

      const result = JSON.stringify(obj, replacer)
      expect(JSON.parse(result)).toEqual({ a: 1 })
    })

    it('handles deeply nested circular references', () => {
      const replacer = Helpers.getCircularReplacer()
      const obj: any = { a: { b: { c: {} } } }
      obj.a.b.c.root = obj

      const result = JSON.stringify(obj, replacer)
      const parsed = JSON.parse(result)
      expect(parsed.a.b.c.root).toBeUndefined()
    })

    it('passes through primitive values', () => {
      const replacer = Helpers.getCircularReplacer()
      const obj = { str: 'hello', num: 42, bool: true, nil: null }

      const result = JSON.stringify(obj, replacer)
      expect(JSON.parse(result)).toEqual(obj)
    })

    it('handles repeated non-circular references by omitting duplicates', () => {
      const replacer = Helpers.getCircularReplacer()
      const shared = { x: 1 }
      const obj = { a: shared, b: shared }

      // WeakSet-based replacer treats repeated references as circular
      const result = JSON.stringify(obj, replacer)
      const parsed = JSON.parse(result)
      expect(parsed.a).toEqual({ x: 1 })
      expect(parsed.b).toBeUndefined()
    })
  })

  describe('ensureArray', () => {
    it('returns an array as-is', () => {
      const arr = [1, 2, 3]
      expect(Helpers.ensureArray(arr)).toBe(arr)
    })

    it('wraps a non-array value in an array', () => {
      expect(Helpers.ensureArray(42)).toEqual([42])
    })

    it('wraps a string in an array', () => {
      expect(Helpers.ensureArray('hello')).toEqual(['hello'])
    })

    it('wraps null in an array', () => {
      expect(Helpers.ensureArray(null)).toEqual([null])
    })

    it('wraps undefined in an array', () => {
      expect(Helpers.ensureArray(undefined)).toEqual([undefined])
    })

    it('wraps an object in an array', () => {
      const obj = { key: 'value' }
      expect(Helpers.ensureArray(obj)).toEqual([obj])
    })

    it('returns an empty array as-is', () => {
      const arr: unknown[] = []
      expect(Helpers.ensureArray(arr)).toBe(arr)
    })
  })

  describe('toString', () => {
    it('converts a string to a string', () => {
      expect(Helpers.toString('hello')).toBe('hello')
    })

    it('converts a number to a string', () => {
      expect(Helpers.toString(42)).toBe('42')
    })

    it('converts null to the string "null"', () => {
      expect(Helpers.toString(null)).toBe('null')
    })

    it('converts undefined to the string "undefined"', () => {
      expect(Helpers.toString(undefined)).toBe('undefined')
    })

    it('converts an ObjectId-like object by calling its toString()', () => {
      class ObjectId {
        private id: string
        constructor(id: string) {
          this.id = id
        }
        toString() {
          return `ObjectId(${this.id})`
        }
      }

      const oid = new ObjectId('abc123')
      expect(Helpers.toString(oid)).toBe('ObjectId(abc123)')
    })

    it('converts a plain object using String()', () => {
      const obj = { foo: 'bar' }
      expect(Helpers.toString(obj)).toBe('[object Object]')
    })

    it('converts zero to string "0"', () => {
      expect(Helpers.toString(0)).toBe('0')
    })

    it('converts boolean false to string "false"', () => {
      expect(Helpers.toString(false)).toBe('false')
    })
  })
})
