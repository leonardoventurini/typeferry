/** Recursively marks a document tree as readonly. */
export type DeepReadonly<TValue> =
  TValue extends Date | RegExp | Uint8Array ? TValue
    : TValue extends (...args: never[]) => unknown ? TValue
      : TValue extends readonly (infer TElement)[] ? readonly DeepReadonly<TElement>[]
        : TValue extends object ? { readonly [TKey in keyof TValue]: DeepReadonly<TValue[TKey]> }
          : TValue

/** Freezes a cloned document tree before it enters the public local-store state. */
export function deepFreeze<TValue>(value: TValue, seen = new WeakSet<object>()): TValue {
  if (typeof value !== 'object' || value === null) return value
  if (seen.has(value)) throw new TypeError('Local collection documents must not contain cycles.')

  seen.add(value)
  if (ArrayBuffer.isView(value)) {
    seen.delete(value)

    return value
  }
  for (const child of Object.values(value)) deepFreeze(child, seen)
  seen.delete(value)

  return Object.freeze(value)
}
