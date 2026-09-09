import { adjustTypesFromJSONValue } from './adjust-types-from-json-value'
import { builtinConverters } from './built-in-converters'
import { clone } from './clone'
import { customTypes, type EJSONTypeFactory } from './custom-types'
import { equals } from './equals'
import { fromJSONValue } from './from-json-value'
import { adjustTypesToJSONValue } from './helpers/adjust-types-to-json-value'
import { isBinary } from './is-binary'
import { parse } from './parse'
import { stringify } from './stringify'
import { toJSONValue } from './to-json-value'
import {
  convertMapToObject,
  isFunction,
  isObjectRecord,
  newBinary,
} from './utils'

export const EJSON = {
  clone,
  equals,
  isBinary,
  parse,
  stringify,
  fromJSONValue,
  toJSONValue,
  newBinary,

  /**
   * @summary Add a custom datatype to EJSON.
   * @locus Anywhere
   * @param {String} name A tag for your custom type; must be unique among
   *                      custom data types defined in your project, and must
   *                      match the result of your type's `typeName` method.
   * @param {Function} factory A function that deserializes a JSON-compatible
   *                           value into an instance of your type. This should
   *                           match the serialization performed by your
   *                           type's `toJSONValue` method.
   */
  addType(name: string, factory: EJSONTypeFactory) {
    if (customTypes.has(name)) {
      throw new Error(`Type ${name} already present`)
    }

    customTypes.set(name, factory)
  },

  _isCustomType(obj: unknown): boolean {
    return (
      isObjectRecord(obj) &&
      isFunction(obj.toJSONValue) &&
      isFunction(obj.typeName) &&
      customTypes.has(String(obj.typeName.call(obj)))
    )
  },

  _getTypes(isOriginal = false) {
    return isOriginal ? customTypes : convertMapToObject(customTypes)
  },

  _getConverters() {
    return builtinConverters
  },

  _adjustTypesToJSONValue: adjustTypesToJSONValue,
  _adjustTypesFromJSONValue: adjustTypesFromJSONValue,
}
