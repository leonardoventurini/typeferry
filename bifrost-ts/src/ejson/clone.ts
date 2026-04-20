import { EJSON } from './index'
import {
  isArguments,
  isFunction,
  isObject,
  isObjectAndNotNull,
  keysOf,
} from './utils'

function clonePrimitive(val: any): { handled: boolean; result?: any } {
  if (!isObject(val)) return { handled: true, result: val }
  if (val === null) return { handled: true, result: null }
  if (val instanceof Date)
    return { handled: true, result: new Date(val.getTime()) }
  if (val instanceof RegExp) return { handled: true, result: val }
  return { handled: false }
}

function cloneSpecialTypes(
  val: any,
  internalClone: (v: any) => any,
): { handled: boolean; result?: any } {
  if (val._bsontype === 'ObjectId' && isFunction(val.toString)) {
    return { handled: true, result: val.toString() }
  }

  if (val.constructor.name === 'model' && isObject(val._doc)) {
    return { handled: true, result: internalClone(val._doc) }
  }

  if (EJSON.isBinary(val)) {
    const ret = EJSON.newBinary(val.length)
    for (let i = 0; i < val.length; i++) ret[i] = val[i]
    return { handled: true, result: ret }
  }

  if (isFunction(val.clone)) {
    return { handled: true, result: val.clone() }
  }

  if (EJSON._isCustomType(val)) {
    return {
      handled: true,
      result: EJSON.fromJSONValue(internalClone(EJSON.toJSONValue(val))),
    }
  }

  return { handled: false }
}

export const clone = (rootVal: any) => {
  const set = new WeakSet()

  function cloneArray(arr: any[]) {
    set.add(arr)

    return arr
      .map(val => {
        if (isObjectAndNotNull(val)) {
          if (set.has(val as object)) return undefined
          set.add(val as object)
        }
        return internalClone(val)
      })
      .filter(val => val !== undefined)
  }

  function internalClone(internalVal: any): any {
    const primitiveResult = clonePrimitive(internalVal)
    if (primitiveResult.handled) return primitiveResult.result

    const specialResult = cloneSpecialTypes(internalVal, internalClone)
    if (specialResult.handled) return specialResult.result

    if (Array.isArray(internalVal)) return cloneArray(internalVal)

    if (isArguments(internalVal)) {
      set.add(internalVal)
      return cloneArray(Array.from(internalVal))
    }

    set.add(internalVal)

    const ret: any = {}
    keysOf(internalVal).forEach(key => {
      if (isObjectAndNotNull(internalVal[key])) {
        if (set.has(internalVal[key])) return
        set.add(internalVal[key])
      }
      ret[key] = internalClone(internalVal[key])
    })

    return ret
  }

  return internalClone(rootVal)
}
