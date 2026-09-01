import { EJSON } from './index'
import { hasOwn, isFunction, isObject, keysOf } from './utils'

function areBothNaN(a: unknown, b: unknown): boolean {
  return Number.isNaN(a) && Number.isNaN(b)
}

function areDatesEqual(a: Date, b: Date): boolean {
  return a.valueOf() === b.valueOf()
}

function areBinaryEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function areArraysEqual(a: unknown[], b: unknown[], options?: any): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!EJSON.equals(a[i], b[i], options)) return false
  }
  return true
}

function handleCustomTypes(a: any, b: any): boolean | null {
  // @ts-ignore
  const customTypeSum = EJSON._isCustomType(a) + EJSON._isCustomType(b)
  if (customTypeSum === 1) return false
  if (customTypeSum === 2) {
    return EJSON.equals(EJSON.toJSONValue(a), EJSON.toJSONValue(b))
  }
  return null
}

function compareKeysOrderSensitive(
  a: object,
  aKeys: string[],
  b: object,
  bKeys: string[],
  options?: any,
): boolean {
  let i = 0
  const ret = aKeys.every(key => {
    if (i >= bKeys.length) return false
    if (key !== bKeys[i]) return false
    if (!EJSON.equals(a[key], b[bKeys[i]], options)) return false
    i++
    return true
  })
  return ret && i === bKeys.length
}

function compareKeysUnordered(
  a: object,
  aKeys: string[],
  b: object,
  bKeys: string[],
  options?: any,
): boolean {
  let i = 0
  const ret = aKeys.every(key => {
    if (!hasOwn(b, key)) return false
    if (!EJSON.equals(a[key], b[key], options)) return false
    i++
    return true
  })
  return ret && i === bKeys.length
}

function handlePrimitiveChecks(a: any, b: any): boolean | null {
  if (a === b) return true
  if (areBothNaN(a, b)) return true
  if (!a || !b) return false
  if (!(isObject(a) && isObject(b))) return false
  return null
}

function handleSpecialTypes(a: any, b: any, options?: any): boolean | null {
  if (a instanceof Date && b instanceof Date) {
    return areDatesEqual(a, b)
  }

  if (EJSON.isBinary(a) && EJSON.isBinary(b)) {
    return areBinaryEqual(a, b)
  }

  if (isFunction(a.equals)) return a.equals(b, options)
  if (isFunction(b.equals)) return b.equals(a, options)

  return null
}

function handleArrayComparison(a: any, b: any, options?: any): boolean | null {
  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)

  if (aIsArray !== bIsArray) return false
  if (aIsArray && bIsArray) return areArraysEqual(a, b, options)

  return null
}

export const equals = (a, b, options?: any) => {
  const primitiveResult = handlePrimitiveChecks(a, b)
  if (primitiveResult !== null) return primitiveResult

  const specialResult = handleSpecialTypes(a, b, options)
  if (specialResult !== null) return specialResult

  const arrayResult = handleArrayComparison(a, b, options)
  if (arrayResult !== null) return arrayResult

  const customResult = handleCustomTypes(a, b)
  if (customResult !== null) return customResult

  const aKeys = keysOf(a)
  const bKeys = keysOf(b)
  const keyOrderSensitive = !!(options && options.keyOrderSensitive)

  if (keyOrderSensitive) {
    return compareKeysOrderSensitive(a, aKeys, b, bKeys, options)
  }

  return compareKeysUnordered(a, aKeys, b, bKeys, options)
}
