function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue)
  }

  if (!isPlainObject(value)) {
    return value
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((accumulator, key) => {
      const child = value[key]

      if (child !== undefined) accumulator[key] = sortJsonValue(child)

      return accumulator
    }, {})
}

/**
 * Provides deterministic JSON output for EJSON canonical mode without relying
 * on a CommonJS dependency that breaks source-first browser consumers.
 */
export function stableStringify(
  value: unknown,
  space?: number | string,
): string {
  return JSON.stringify(sortJsonValue(value), null, space)
}
