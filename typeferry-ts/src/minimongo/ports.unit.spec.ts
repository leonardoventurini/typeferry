import { describe, expect, it } from 'vitest'

import {
  meteor352Components,
  type MutationEngine,
  type QueryEngine,
} from './components'
import type { DocumentStore, DocumentStoreFactory } from './document-store'
import { LocalCollection } from './local-collection'
import type { ModifyOptions } from './modifier'
import type {
  CollationOptions,
  Modifier,
  Projection,
  Selector,
  SortSpecifier,
} from './types'

class RecordingStoreFactory implements DocumentStoreFactory {
  creations = 0

  create<TId, TDocument>(): DocumentStore<TId, TDocument> {
    this.creations += 1

    return meteor352Components.documentStoreFactory.create<TId, TDocument>()
  }
}

class RecordingQueryEngine implements QueryEngine {
  matcherCalls = 0
  sorterCalls = 0
  projectionCalls = 0

  matcher<TDocument extends object>(
    selector: Selector<TDocument> | unknown,
    options?: {
      readonly isUpdate?: boolean
      readonly collation?: CollationOptions
      readonly allowJavascriptWhere?: boolean
    },
  ) {
    this.matcherCalls += 1

    return meteor352Components.query.matcher(selector, options)
  }

  sorter<TDocument extends object>(sort: SortSpecifier<TDocument> | unknown, collation?: CollationOptions) {
    this.sorterCalls += 1

    return meteor352Components.query.sorter(sort, collation)
  }

  projection<TDocument extends object>(projection?: Projection<TDocument> | Record<string, unknown>) {
    this.projectionCalls += 1

    return meteor352Components.query.projection(projection)
  }
}

class RecordingMutationEngine implements MutationEngine {
  modifications = 0
  upserts = 0

  modify<TDocument extends Record<string, unknown>>(
    document: TDocument,
    modifier: Modifier<TDocument> | Partial<TDocument> | unknown,
    options?: ModifyOptions,
  ): void {
    this.modifications += 1
    meteor352Components.mutations.modify(document, modifier, options)
  }

  createUpsert<TDocument extends Record<string, unknown>>(
    selector: unknown,
    modifier: Modifier<TDocument> | Partial<TDocument>,
  ): TDocument {
    this.upserts += 1

    return meteor352Components.mutations.createUpsert(selector, modifier)
  }
}

describe('Minimongo component contracts', () => {
  it('runs the same insertion-order and cloning contract through store replacements', () => {
    for (const factory of [meteor352Components.documentStoreFactory, new RecordingStoreFactory()]) {
      const store = factory.create<string, { nested: { value: number } }>()
      store.set('b', { nested: { value: 2 } })
      store.set('a', { nested: { value: 1 } })
      const clone = store.clone()
      clone.get('b')!.nested.value = 3

      expect([...store.entries()].map(([id]) => id)).toEqual(['b', 'a'])
      expect(store.get('b')!.nested.value).toBe(2)
      expect(clone.get('b')!.nested.value).toBe(3)
    }
  })

  it('routes collection work only through the injected store, query, and mutation ports', () => {
    const stores = new RecordingStoreFactory()
    const query = new RecordingQueryEngine()
    const mutations = new RecordingMutationEngine()
    let generatedIds = 0
    const collection = new LocalCollection<{ value: number }, string>(undefined, {
      components: {
        documentStoreFactory: stores,
        query,
        mutations,
        randomId: () => generatedIds++ === 0 ? 'generated' : 'upserted',
      },
    })

    collection.insert({ value: 1 })
    collection.find({ value: 1 }, { sort: { value: 1 }, projection: { value: 1 } }).fetch()
    collection.update('generated', { $inc: { value: 1 } })
    collection.upsert({ value: 3 }, { $set: { value: 3 } })

    expect(stores.creations).toBe(1)
    expect(query.matcherCalls).toBeGreaterThanOrEqual(3)
    expect(query.sorterCalls).toBe(1)
    expect(query.projectionCalls).toBeGreaterThanOrEqual(1)
    expect(mutations.modifications).toBe(1)
    expect(mutations.upserts).toBe(1)
  })
})
