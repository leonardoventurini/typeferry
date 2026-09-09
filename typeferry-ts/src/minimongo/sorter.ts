import { MiniMongoQueryError } from './errors'
import { expandArrays, lookupBranches } from './path'
import type { CollationOptions, SortDirection, SortSpecifier } from './types'
import { meteorValueSemantics, type ValueSemantics } from './value-semantics'

type SortPart = readonly [path: string, ascending: boolean]

function ascending(direction: SortDirection): boolean {
  if ([1, 'asc', 'ascending'].includes(direction)) return true
  if ([-1, 'desc', 'descending'].includes(direction)) return false

  throw new MiniMongoQueryError(`Bad sort specification: ${String(direction)}`)
}

function normalizeSort(specifier: unknown): readonly SortPart[] {
  if (!specifier) return []
  if (Array.isArray(specifier)) {
    return specifier.map(entry => {
      if (typeof entry === 'string') return [entry, true] as const
      if (Array.isArray(entry) && typeof entry[0] === 'string') {
        return [entry[0], ascending(entry[1] as SortDirection)] as const
      }

      throw new MiniMongoQueryError(`Bad sort specification: ${JSON.stringify(specifier)}`)
    })
  }
  if (typeof specifier === 'object') {
    return Object.entries(specifier as Record<string, SortDirection>)
      .map(([path, direction]) => [path, ascending(direction)] as const)
  }

  throw new MiniMongoQueryError(`Bad sort specification: ${String(specifier)}`)
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

/** Compiles Meteor-compatible sort specifications into document comparators. */
export class Sorter<TDocument extends object = Record<string, unknown>> {
  private readonly parts: readonly SortPart[]
  private readonly functionComparator: ((left: TDocument, right: TDocument) => number) | undefined
  private readonly collator: Intl.Collator | undefined

  constructor(
    specifier: SortSpecifier<TDocument> | unknown,
    collation?: CollationOptions,
    private readonly values: ValueSemantics = meteorValueSemantics,
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
      if (options.distances) {
        const leftDistance = options.distances.get((left as { _id?: unknown })._id)
        const rightDistance = options.distances.get((right as { _id?: unknown })._id)
        if (leftDistance !== rightDistance) return (leftDistance ?? 0) - (rightDistance ?? 0)
      }
      for (const [path, isAscending] of this.parts) {
        const leftValue = this.minKey(left, path, isAscending)
        const rightValue = this.minKey(right, path, isAscending)
        const compared = this.values.compare(leftValue, rightValue, this.collator)
        if (compared !== 0) return isAscending ? compared : -compared
      }

      return 0
    }
  }

  _getPaths(): readonly string[] {
    return this.parts.map(([path]) => path)
  }

  private minKey(document: TDocument, path: string, isAscending: boolean): unknown {
    const branches = expandArrays(
      lookupBranches(document, path, { forSort: true }),
      { skipArrays: true },
    )
    if (branches.length === 0) return undefined

    return branches.slice(1).reduce(
      (selected, branch) => {
        const compared = this.values.compare(branch.value, selected, this.collator)

        return isAscending ? compared < 0 ? branch.value : selected : compared > 0 ? branch.value : selected
      },
      branches[0]?.value,
    )
  }
}
