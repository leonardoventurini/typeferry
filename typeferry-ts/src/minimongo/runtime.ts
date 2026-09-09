import { minimongoComponents, type MinimongoComponents } from './components'
import { LocalCollection, type LocalCollectionOptions } from './local-collection'
import { Matcher } from './matcher'
import { ObjectID } from './object-id'
import { Sorter } from './sorter'
import type { CollationOptions, MinimongoId, Selector, SortSpecifier } from './types'

export interface MinimongoRuntime {
  readonly components: MinimongoComponents
  readonly LocalCollection: typeof LocalCollection
  readonly Matcher: typeof Matcher
  readonly Sorter: typeof Sorter
  readonly ObjectID: typeof ObjectID
}

/** Creates an isolated Minimongo facade whose internal ports can be replaced. */
export function createMinimongo(
  overrides: Partial<MinimongoComponents> = {},
): MinimongoRuntime {
  const components = minimongoComponents(overrides)

  class RuntimeLocalCollection<
    TSchema extends object = Record<string, unknown>,
    TId extends MinimongoId = MinimongoId,
  > extends LocalCollection<TSchema, TId> {
    constructor(name?: string, options: LocalCollectionOptions = {}) {
      super(name, {
        components: {
          ...overrides,
          ...options.components,
        },
      })
    }
  }

  class RuntimeMatcher<TDocument extends object = object>
    extends Matcher<TDocument> {
    constructor(
      selector: Selector<TDocument> | unknown,
      isUpdate = false,
      collation?: CollationOptions | Intl.Collator,
    ) {
      super(
        selector,
        isUpdate,
        collation,
        components.values,
        components.allowJavascriptWhere,
      )
    }
  }

  class RuntimeSorter<TDocument extends object = object>
    extends Sorter<TDocument> {
    constructor(
      sort: SortSpecifier<TDocument> | unknown,
      collation?: CollationOptions,
    ) {
      super(sort, collation, components.values)
    }
  }

  return {
    components,
    LocalCollection: RuntimeLocalCollection,
    Matcher: RuntimeMatcher,
    Sorter: RuntimeSorter,
    ObjectID,
  }
}
