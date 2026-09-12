import { LocalQueryError as LocalQueryError } from './errors'
import { expandArrays, lookupBranches } from './path'
import type { CollationOptions, SortDirection, SortSpecifier } from './types'
import { localValueSemantics, type ValueSemantics } from './value-semantics'

type SortPart = readonly [path: string, ascending: boolean]

type SortKey = readonly unknown[]

function ascending(direction: SortDirection): boolean {
  if ([1, 'asc', 'ascending'].includes(direction)) return true
  if ([-1, 'desc', 'descending'].includes(direction)) return false

  throw new LocalQueryError(`Bad sort specification: ${String(direction)}`)
}

function normalizeSort(specifier: unknown): readonly SortPart[] {
  if (!specifier) return []
  if (Array.isArray(specifier)) {
    return specifier.map(entry => {
      if (typeof entry === 'string') return validatedPart(entry, true)
      if (Array.isArray(entry) && typeof entry[0] === 'string') {
        return validatedPart(entry[0], ascending(entry[1] as SortDirection))
      }

      throw new LocalQueryError(`Bad sort specification: ${JSON.stringify(specifier)}`)
    })
  }
  if (typeof specifier === 'object') {
    return Object.entries(specifier as Record<string, SortDirection>)
      .map(([path, direction]) => validatedPart(path, ascending(direction)))
  }

  throw new LocalQueryError(`Bad sort specification: ${String(specifier)}`)
}

function validatedPart(path: string, isAscending: boolean): SortPart {
  if (!path) throw new Error('sort keys must be non-empty')
  if (path.startsWith('$')) throw new Error(`unsupported sort key: ${path}`)

  return [path, isAscending]
}

function createCollator(options?: CollationOptions): Intl.Collator | undefined {
  if (!options) return undefined

  return new Intl.Collator(options.locale, {
    sensitivity: options.strength === 1 ? 'base' : options.strength === 2 ? 'accent' : 'variant',
    numeric: options.numericOrdering,
    caseLevel: options.caseLevel,
    caseFirst: options.caseFirst === 'off' ? 'false' : options.caseFirst,
  } as Intl.CollatorOptions)
}

/** Compiles Mongo-style sort specifications into document comparators. */
export class Sorter<TDocument extends object = object> {
  private readonly parts: readonly SortPart[]
  private readonly functionComparator: ((left: TDocument, right: TDocument) => number) | undefined
  private readonly collator: Intl.Collator | undefined

  constructor(
    specifier: SortSpecifier<TDocument> | unknown,
    collation?: CollationOptions,
    private readonly values: ValueSemantics = localValueSemantics,
  ) {
    this.functionComparator = typeof specifier === 'function'
      ? specifier as (left: TDocument, right: TDocument) => number
      : undefined
    this.parts = this.functionComparator ? [] : normalizeSort(specifier)
    this.collator = createCollator(collation)
  }

  getComparator(options: { readonly distances?: ReadonlyMap<unknown, number> } = {}): (
    left: TDocument,
    right: TDocument,
  ) => number {
    if (this.functionComparator) return this.functionComparator

    return (left, right) => {
      if (this.parts.length === 0 && options.distances) {
        const leftDistance = options.distances.get((left as { _id?: unknown })._id)
        const rightDistance = options.distances.get((right as { _id?: unknown })._id)
        if (leftDistance !== rightDistance) return (leftDistance ?? 0) - (rightDistance ?? 0)
      }
      const leftKey = this.documentKey(left)
      const rightKey = this.documentKey(right)
      for (let index = 0; index < this.parts.length; index += 1) {
        const isAscending = this.parts[index]![1]
        const leftValue = leftKey[index]
        const rightValue = rightKey[index]
        const compared = this.values.compare(leftValue, rightValue, this.collator)
        if (compared !== 0) return isAscending ? compared : -compared
      }

      return 0
    }
  }

  _getPaths(): readonly string[] {
    return this.parts.map(([path]) => path)
  }

  private documentKey(document: TDocument): SortKey {
    if (this.parts.length === 0) return []
    let knownPaths: Set<string> | undefined
    const valuesByPart = this.parts.map(([path]) => {
      const expanded = expandArrays(
        lookupBranches(document, path, { forSort: true }),
        { skipArrays: true },
      )
      const branches = expanded.length > 0 ? expanded : [{ value: undefined }]
      const values = new Map<string, unknown>()
      let usesArrayPath = false
      for (const branch of branches) {
        if (!branch.arrayIndices) {
          if (branches.length > 1) throw new Error('multiple branches but no array used?')
          values.set('', branch.value)
          continue
        }
        usesArrayPath = true
        const arrayPath = `${branch.arrayIndices.join(',')},`
        if (values.has(arrayPath)) throw new Error(`duplicate path: ${arrayPath}`)
        values.set(arrayPath, branch.value)
        if (knownPaths && !knownPaths.has(arrayPath)) throw new Error('cannot index parallel arrays')
      }
      if (knownPaths) {
        if (!values.has('') && values.size !== knownPaths.size) {
          throw new Error('cannot index parallel arrays!')
        }
      } else if (usesArrayPath) {
        knownPaths = new Set(values.keys())
      }

      return values
    })

    const keys: SortKey[] = knownPaths
      ? [...knownPaths].map(path => valuesByPart.map(values => values.has('') ? values.get('') : values.get(path)))
      : [valuesByPart.map(values => values.get(''))]
    let minimum = keys[0]!
    for (const key of keys.slice(1)) {
      if (this.compareKeys(key, minimum) < 0) minimum = key
    }

    return minimum
  }

  private compareKeys(left: SortKey, right: SortKey): number {
    for (let index = 0; index < this.parts.length; index += 1) {
      const compared = this.values.compare(left[index], right[index], this.collator)
      if (compared !== 0) return this.parts[index]![1] ? compared : -compared
    }

    return 0
  }
}
