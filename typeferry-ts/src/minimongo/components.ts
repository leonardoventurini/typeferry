import { MemoryDocumentStore, type DocumentStore, type DocumentStoreFactory } from './document-store'
import { stringIdentityCodec, type IdentityCodec } from './identity'
import { Matcher } from './matcher'
import { createUpsertDocument, modifyDocument, type ModifyOptions } from './modifier'
import { compileProjection, type ProjectionFunction } from './projection'
import { Sorter } from './sorter'
import type { CollationOptions, Modifier, Projection, Selector, SortSpecifier } from './types'
import { localValueSemantics, type ValueSemantics } from './value-semantics'

export interface QueryEngine {
  matcher<TDocument extends object>(
    selector: Selector<TDocument> | unknown,
    options?: {
      readonly isUpdate?: boolean
      readonly collation?: CollationOptions
    },
  ): Matcher<TDocument>
  sorter<TDocument extends object>(
    sort: SortSpecifier<TDocument> | unknown,
    collation?: CollationOptions,
  ): Sorter<TDocument>
  projection<TDocument extends object>(
    projection?: Projection<TDocument> | Record<string, unknown>,
  ): ProjectionFunction<TDocument>
}

export interface MutationEngine {
  modify<TDocument extends Record<string, unknown>>(
    document: TDocument,
    modifier: Modifier<TDocument> | Partial<TDocument> | unknown,
    options?: ModifyOptions,
  ): void
  createUpsert<TDocument extends Record<string, unknown>>(
    selector: unknown,
    modifier: Modifier<TDocument> | Partial<TDocument>,
  ): TDocument
}

export interface LocalStoreRuntime {
  readonly values: ValueSemantics
  readonly identities: IdentityCodec<unknown>
  readonly documentStoreFactory: DocumentStoreFactory
  readonly query: QueryEngine
  readonly mutations: MutationEngine
  readonly randomId: () => string
  readonly now: () => Date
}

export const LOCAL_STORE_RUNTIME: unique symbol = Symbol('TypeFerryLocalStoreRuntime')

function randomId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)

  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function queryEngine(values: ValueSemantics): QueryEngine {
  return {
    matcher(selector, options) {
      return new Matcher(
        selector,
        options?.isUpdate,
        options?.collation,
        values,
      )
    },
    sorter(sort, collation) {
      return new Sorter(sort, collation, values)
    },
    projection(projection) {
      return compileProjection(projection, values)
    },
  }
}

function mutationEngine(values: ValueSemantics): MutationEngine {
  return {
    modify(document, modifier, options) {
      modifyDocument(document, modifier, options, values)
    },
    createUpsert(selector, modifier) {
      return createUpsertDocument(selector, modifier, values)
    },
  }
}

function documentStoreFactory(
  identities: IdentityCodec<unknown>,
  values: ValueSemantics,
): DocumentStoreFactory {
  return {
    create<TId, TDocument>(): DocumentStore<TId, TDocument> {
      return new MemoryDocumentStore(
        identities as IdentityCodec<TId>,
        values,
      )
    },
  }
}

export const localStoreRuntime: LocalStoreRuntime = Object.freeze({
  values: localValueSemantics,
  identities: stringIdentityCodec,
  documentStoreFactory: documentStoreFactory(stringIdentityCodec, localValueSemantics),
  query: queryEngine(localValueSemantics),
  mutations: mutationEngine(localValueSemantics),
  randomId,
  now: () => new Date(),
})
