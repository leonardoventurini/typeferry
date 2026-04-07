import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CustomModels } from './custom-models'
import { customTypes } from './custom-types'
import { EJSON } from './index'

describe('CustomModels', () => {
  beforeEach(() => {
    // Clear any previously registered types
    customTypes.clear()
  })

  afterEach(() => {
    customTypes.clear()
  })

  describe('Address', () => {
    it('stores city and state', () => {
      const addr = new CustomModels.Address('Montreal', 'Quebec')

      expect(addr.city).toBe('Montreal')
      expect(addr.state).toBe('Quebec')
    })

    describe('typeName()', () => {
      it('returns "Address"', () => {
        const addr = new CustomModels.Address('NYC', 'NY')
        expect(addr.typeName()).toBe('Address')
      })
    })

    describe('toJSONValue()', () => {
      it('returns an object with city and state', () => {
        const addr = new CustomModels.Address('Montreal', 'Quebec')

        expect(addr.toJSONValue()).toEqual({
          city: 'Montreal',
          state: 'Quebec',
        })
      })
    })

    describe('equals()', () => {
      it('returns true for identical Address instances', () => {
        const a = new CustomModels.Address('Montreal', 'Quebec')
        const b = new CustomModels.Address('Montreal', 'Quebec')

        expect(a.equals(b)).toBe(true)
      })

      it('returns false for different cities', () => {
        const a = new CustomModels.Address('Montreal', 'Quebec')
        const b = new CustomModels.Address('Toronto', 'Quebec')

        expect(a.equals(b)).toBe(false)
      })

      it('returns false for different states', () => {
        const a = new CustomModels.Address('Montreal', 'Quebec')
        const b = new CustomModels.Address('Montreal', 'Ontario')

        expect(a.equals(b)).toBe(false)
      })

      it('returns false when compared to a non-Address object', () => {
        const addr = new CustomModels.Address('Montreal', 'Quebec')

        expect(addr.equals({ city: 'Montreal', state: 'Quebec' })).toBe(false)
      })

      it('returns false when compared to null', () => {
        const addr = new CustomModels.Address('Montreal', 'Quebec')
        expect(addr.equals(null)).toBe(false)
      })
    })
  })

  describe('Person', () => {
    it('stores name, birthDate, and address', () => {
      const date = new Date('1990-01-15')
      const addr = new CustomModels.Address('Montreal', 'Quebec')
      const person = new CustomModels.Person('John', date, addr)

      expect(person.name).toBe('John')
      expect(person.birthDate).toBe(date)
      expect(person.address).toBe(addr)
    })

    describe('typeName()', () => {
      it('returns "Person"', () => {
        const person = new CustomModels.Person(
          'John',
          new Date(),
          new CustomModels.Address('X', 'Y'),
        )
        expect(person.typeName()).toBe('Person')
      })
    })

    describe('toJSONValue()', () => {
      it('returns EJSON-serialized values for date and address', () => {
        CustomModels.addTypes()

        const date = new Date('2000-06-15T00:00:00.000Z')
        const addr = new CustomModels.Address('Montreal', 'Quebec')
        const person = new CustomModels.Person('Jane', date, addr)

        const json = person.toJSONValue()

        expect(json.name).toBe('Jane')
        expect(json.birthDate).toEqual(EJSON.toJSONValue(date))
        expect(json.address).toEqual(EJSON.toJSONValue(addr))
      })
    })

    describe('equals()', () => {
      it('returns true for equal Person instances', () => {
        CustomModels.addTypes()

        const date = new Date('1990-01-15')
        const addr1 = new CustomModels.Address('Montreal', 'Quebec')
        const addr2 = new CustomModels.Address('Montreal', 'Quebec')

        const p1 = new CustomModels.Person('John', date, addr1)
        const p2 = new CustomModels.Person('John', new Date('1990-01-15'), addr2)

        expect(p1.equals(p2)).toBe(true)
      })

      it('returns false for different names', () => {
        CustomModels.addTypes()

        const date = new Date()
        const addr = new CustomModels.Address('X', 'Y')

        const p1 = new CustomModels.Person('Alice', date, addr)
        const p2 = new CustomModels.Person('Bob', date, addr)

        expect(p1.equals(p2)).toBe(false)
      })

      it('returns false for different dates', () => {
        CustomModels.addTypes()

        const addr = new CustomModels.Address('X', 'Y')

        const p1 = new CustomModels.Person(
          'John',
          new Date('1990-01-01'),
          addr,
        )
        const p2 = new CustomModels.Person(
          'John',
          new Date('2000-01-01'),
          addr,
        )

        expect(p1.equals(p2)).toBe(false)
      })

      it('returns false for different addresses', () => {
        CustomModels.addTypes()

        const date = new Date()

        const p1 = new CustomModels.Person(
          'John',
          date,
          new CustomModels.Address('Montreal', 'Quebec'),
        )
        const p2 = new CustomModels.Person(
          'John',
          date,
          new CustomModels.Address('Toronto', 'Ontario'),
        )

        expect(p1.equals(p2)).toBe(false)
      })

      it('returns false for non-Person objects', () => {
        const person = new CustomModels.Person(
          'John',
          new Date(),
          new CustomModels.Address('X', 'Y'),
        )

        expect(person.equals({ name: 'John' })).toBe(false)
      })
    })
  })

  describe('Holder', () => {
    it('stores any value', () => {
      const holder = new CustomModels.Holder({ key: 'value' })
      expect(holder.value).toEqual({ key: 'value' })
    })

    it('stores primitive values', () => {
      const holder = new CustomModels.Holder(42)
      expect(holder.value).toBe(42)
    })

    describe('typeName()', () => {
      it('returns "Holder"', () => {
        const holder = new CustomModels.Holder('test')
        expect(holder.typeName()).toBe('Holder')
      })
    })

    describe('toJSONValue()', () => {
      it('returns the raw value', () => {
        const holder = new CustomModels.Holder({ x: 1 })
        expect(holder.toJSONValue()).toEqual({ x: 1 })
      })

      it('returns primitive value directly', () => {
        const holder = new CustomModels.Holder(99)
        expect(holder.toJSONValue()).toBe(99)
      })
    })

    describe('equals()', () => {
      it('returns true for Holders with equal values', () => {
        CustomModels.addTypes()

        const h1 = new CustomModels.Holder({ a: 1 })
        const h2 = new CustomModels.Holder({ a: 1 })

        expect(h1.equals(h2)).toBe(true)
      })

      it('returns false for Holders with different values', () => {
        CustomModels.addTypes()

        const h1 = new CustomModels.Holder(1)
        const h2 = new CustomModels.Holder(2)

        expect(h1.equals(h2)).toBe(false)
      })

      it('returns false for non-Holder objects', () => {
        const holder = new CustomModels.Holder(42)
        expect(holder.equals({ value: 42 })).toBe(false)
      })

      it('returns false when comparing to null', () => {
        const holder = new CustomModels.Holder('test')
        expect(holder.equals(null)).toBe(false)
      })
    })
  })

  describe('addTypes()', () => {
    it('registers Address, Person, and Holder types with EJSON', () => {
      CustomModels.addTypes()

      const types = EJSON._getTypes(true) as Map<string, unknown>

      expect(types.has('Address')).toBe(true)
      expect(types.has('Person')).toBe(true)
      expect(types.has('Holder')).toBe(true)
    })

    it('throws if types are already registered', () => {
      CustomModels.addTypes()

      expect(() => CustomModels.addTypes()).toThrow('already present')
    })

    it('enables EJSON round-trip for Address', () => {
      CustomModels.addTypes()

      const addr = new CustomModels.Address('Montreal', 'Quebec')
      const str = EJSON.stringify(addr)
      const parsed = EJSON.parse(str)

      expect(parsed).toBeInstanceOf(CustomModels.Address)
      expect(parsed.city).toBe('Montreal')
      expect(parsed.state).toBe('Quebec')
    })

    it('enables EJSON round-trip for Person', () => {
      CustomModels.addTypes()

      const date = new Date('1990-05-20T00:00:00.000Z')
      const addr = new CustomModels.Address('Montreal', 'Quebec')
      const person = new CustomModels.Person('Jane', date, addr)

      const str = EJSON.stringify(person)
      const parsed = EJSON.parse(str)

      expect(parsed).toBeInstanceOf(CustomModels.Person)
      expect(parsed.name).toBe('Jane')
      expect(parsed.birthDate).toBeInstanceOf(Date)
      expect(parsed.birthDate.getTime()).toBe(date.getTime())
      expect(parsed.address).toBeInstanceOf(CustomModels.Address)
      expect(parsed.address.city).toBe('Montreal')
    })

    it('enables EJSON round-trip for Holder', () => {
      CustomModels.addTypes()

      const holder = new CustomModels.Holder({ x: 1, y: 2 })
      const str = EJSON.stringify(holder)
      const parsed = EJSON.parse(str)

      expect(parsed).toBeInstanceOf(CustomModels.Holder)
      expect(parsed.value).toEqual({ x: 1, y: 2 })
    })

    it('enables EJSON.clone for custom types', () => {
      CustomModels.addTypes()

      const addr = new CustomModels.Address('Montreal', 'Quebec')
      const cloned = EJSON.clone(addr)

      expect(cloned).toBeInstanceOf(CustomModels.Address)
      expect(cloned).not.toBe(addr)
      expect(cloned.city).toBe('Montreal')
      expect(cloned.state).toBe('Quebec')
    })

    it('enables EJSON.equals for custom types', () => {
      CustomModels.addTypes()

      const a1 = new CustomModels.Address('Montreal', 'Quebec')
      const a2 = new CustomModels.Address('Montreal', 'Quebec')
      const a3 = new CustomModels.Address('Toronto', 'Ontario')

      expect(EJSON.equals(a1, a2)).toBe(true)
      expect(EJSON.equals(a1, a3)).toBe(false)
    })

    it('Holder and Address with same toJSONValue are not equal', () => {
      CustomModels.addTypes()

      const addr = new CustomModels.Address('Montreal', 'Quebec')
      const holder = new CustomModels.Holder({
        city: 'Montreal',
        state: 'Quebec',
      })

      // Their toJSONValue() outputs are the same
      expect(holder.toJSONValue()).toEqual(addr.toJSONValue())
      // But they are not equal because they are different types
      expect(addr.equals(holder)).toBe(false)
      expect(holder.equals(addr)).toBe(false)
    })
  })
})
