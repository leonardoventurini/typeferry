import { expect, test } from 'vitest'

import { CustomModels } from './custom-models'
import { EJSON } from './index'

const testSameConstructors = (someObj: unknown, compareWith: unknown): void => {
  if (
    someObj === null ||
    compareWith === null ||
    (typeof someObj !== 'object' && typeof someObj !== 'function') ||
    (typeof compareWith !== 'object' && typeof compareWith !== 'function')
  ) {
    expect(someObj).toEqual(compareWith)
    return
  }

  expect(someObj.constructor).toEqual(compareWith.constructor)

  if (!Array.isArray(someObj)) {
    Object.keys(someObj).forEach(key => {
      if (!(key in compareWith)) throw new Error(`Missing comparison key: ${key}`)

      const value = Object.getOwnPropertyDescriptor(someObj, key)?.value
      const comparison = Object.getOwnPropertyDescriptor(compareWith, key)?.value
      testSameConstructors(value, comparison)
    })
  }
}

const testReallyEqual = (someObj: unknown, compareWith: unknown): void => {
  expect(someObj).toEqual(compareWith)
  testSameConstructors(someObj, compareWith)
}

const testRoundTrip = (someObj: unknown): void => {
  const str = EJSON.stringify(someObj)

  const roundTrip = EJSON.parse(str)

  testReallyEqual(someObj, roundTrip)
}

const testCustomObject = (someObj: unknown): void => {
  testRoundTrip(someObj)
  testReallyEqual(someObj, EJSON.clone(someObj))
}

test('custom types', () => {
  CustomModels.addTypes()

  const address = new CustomModels.Address('Montreal', 'Quebec')

  testCustomObject({ address: address })

  // Test that difference is detected even if they
  // have similar toJSONValue results:
  const nakedA = { city: 'Montreal', state: 'Quebec' }

  expect(nakedA).not.toStrictEqual(address)
  expect(address).not.toStrictEqual(nakedA)

  const holder = new CustomModels.Holder(nakedA)

  expect(holder.toJSONValue()).toEqual(address.toJSONValue()) // sanity check

  expect(holder).not.toEqual(address)
  expect(address).not.toEqual(holder)

  const d = new Date()
  const obj = new CustomModels.Person('John Doe', d, address)

  testCustomObject(obj)

  // Test clone is deep:
  const clone = EJSON.clone(obj)
  clone.address.city = 'Sherbrooke'
  expect(obj).not.toEqual(clone)
})
