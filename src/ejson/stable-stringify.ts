type JsonPrimitive = boolean | null | number | string
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

function isPlainObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue)
  }

  if (!isPlainObject(value)) {
    return value
  }

  return Object.keys(value)
    .sort()
    .reduce<{ [key: string]: JsonValue }>((accumulator, key) => {
      accumulator[key] = sortJsonValue(value[key])
      return accumulator
    }, {})
}

/**
 * Provides deterministic JSON output for EJSON canonical mode without relying
 * on a CommonJS dependency that breaks source-first browser consumers.
 */
export function stableStringify(
  value: JsonValue,
  space?: number | string,
): string {
  return JSON.stringify(sortJsonValue(value), null, space)
}
