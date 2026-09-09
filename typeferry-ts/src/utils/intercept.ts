import { isPlainObject } from './lodash'

/**
 * Get the params and the result and combine in a single output.
 *
 * @param func
 */
export function intercept<TThis, TParams extends object, TResult>(
  func: (this: TThis, params: TParams) => TResult | Promise<TResult>,
) {
  return async function (this: TThis, params: TParams) {
    let result = func.call(this, params)

    if (func.constructor.name === 'AsyncFunction' || result instanceof Promise)
      result = await result

    /**
     * If the result is not an object, return it as is. We need to support primitives.
     */
    if (result != null && !isPlainObject(result)) {
      return result
    }

    return Object.assign({}, params, result ?? {})
  }
}
