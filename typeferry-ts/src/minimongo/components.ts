import { MemoryDocumentStore, type DocumentStore, type DocumentStoreFactory } from './document-store'
import { diffOrdered, diffUnordered, type ChangeCallbacks } from './diff'
import { meteorIdentityCodec, type IdentityCodec } from './identity'
import { Matcher } from './matcher'
import { createUpsertDocument, modifyDocument, type ModifyOptions } from './modifier'
import { compileProjection, type ProjectionFunction } from './projection'
import { Sorter } from './sorter'
import type { CollationOptions, Modifier, Projection, Selector, SortSpecifier } from './types'
import { meteorValueSemantics, type ValueSemantics } from './value-semantics'

export interface ObserverScheduler {
  queue(task: () => void | Promise<void>): void
  drain(): void | Promise<void>
  defer(task: () => void): void
}

export class SynchronousObserverScheduler implements ObserverScheduler {
  private readonly tasks: (() => void | Promise<void>)[] = []

  queue(task: () => void | Promise<void>): void {
    this.tasks.push(task)
  }

  drain(): void | Promise<void> {
    while (this.tasks.length > 0) {
      const task = this.tasks.shift()
      const result = task?.()
      if (result instanceof Promise) {
        return result.then(() => this.drain())
      }
    }
  }

  defer(task: () => void): void {
    queueMicrotask(task)
  }
}

export interface QueryEngine {
  matcher<TDocument extends object>(
    selector: Selector<TDocument> | unknown,
    options?: {
      readonly isUpdate?: boolean
      readonly collation?: CollationOptions
      readonly allowJavascriptWhere?: boolean
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

export interface ObserverEngine {
  diff<TDocument extends object>(
    ordered: boolean,
    previous: readonly TDocument[],
    current: readonly TDocument[],
    callbacks: ChangeCallbacks<TDocument>,
    identities: IdentityCodec<unknown>,
    values: ValueSemantics,
  ): void
}

export interface MinimongoComponents {
  readonly values: ValueSemantics
  readonly identities: IdentityCodec<unknown>
  readonly documentStoreFactory: DocumentStoreFactory
  readonly query: QueryEngine
  readonly mutations: MutationEngine
  readonly observers: ObserverEngine
  readonly scheduler: ObserverScheduler
  readonly randomId: () => string
  readonly now: () => Date
  readonly allowJavascriptWhere: boolean
}

function randomId(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz'
  const bytes = new Uint8Array(17)
  crypto.getRandomValues(bytes)

  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')
}

function queryEngine(values: ValueSemantics): QueryEngine {
  return {
    matcher(selector, options) {
      return new Matcher(
        selector,
        options?.isUpdate,
        options?.collation,
        values,
        options?.allowJavascriptWhere,
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

const defaultObserverEngine: ObserverEngine = {
  diff(ordered, previous, current, callbacks, identities, values) {
    if (ordered) diffOrdered(previous, current, callbacks, identities, values)
    else diffUnordered(previous, current, callbacks, identities, values)
  },
}

export const meteor352Components: MinimongoComponents = {
  values: meteorValueSemantics,
  identities: meteorIdentityCodec,
  documentStoreFactory: documentStoreFactory(meteorIdentityCodec, meteorValueSemantics),
  query: queryEngine(meteorValueSemantics),
  mutations: mutationEngine(meteorValueSemantics),
  observers: defaultObserverEngine,
  scheduler: new SynchronousObserverScheduler(),
  randomId,
  now: () => new Date(),
  allowJavascriptWhere: false,
}

export function minimongoComponents(
  overrides: Partial<MinimongoComponents> = {},
): MinimongoComponents {
  const values = overrides.values ?? meteor352Components.values
  const identities = overrides.identities ?? meteor352Components.identities

  return {
    ...meteor352Components,
    values,
    identities,
    documentStoreFactory: overrides.documentStoreFactory
      ?? documentStoreFactory(identities, values),
    query: overrides.query ?? queryEngine(values),
    mutations: overrides.mutations ?? mutationEngine(values),
    scheduler: new SynchronousObserverScheduler(),
    ...overrides,
  }
}
