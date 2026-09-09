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
  diff<TDocument extends Record<string, unknown>>(
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

const defaultQueryEngine: QueryEngine = {
  matcher(selector, options) {
    return new Matcher(
      selector,
      options?.isUpdate,
      options?.collation,
      meteorValueSemantics,
      options?.allowJavascriptWhere,
    )
  },
  sorter(sort, collation) {
    return new Sorter(sort, collation, meteorValueSemantics)
  },
  projection(projection) {
    return compileProjection(projection, meteorValueSemantics)
  },
}

const defaultMutationEngine: MutationEngine = {
  modify(document, modifier, options) {
    modifyDocument(document, modifier, options, meteorValueSemantics)
  },
  createUpsert(selector, modifier) {
    return createUpsertDocument(selector, modifier, meteorValueSemantics)
  },
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
  documentStoreFactory: {
    create<TId, TDocument>(): DocumentStore<TId, TDocument> {
      return new MemoryDocumentStore(
        meteorIdentityCodec as IdentityCodec<TId>,
        meteorValueSemantics,
      )
    },
  },
  query: defaultQueryEngine,
  mutations: defaultMutationEngine,
  observers: defaultObserverEngine,
  scheduler: new SynchronousObserverScheduler(),
  randomId,
  now: () => new Date(),
  allowJavascriptWhere: false,
}

export function minimongoComponents(
  overrides: Partial<MinimongoComponents> = {},
): MinimongoComponents {
  return {
    ...meteor352Components,
    scheduler: new SynchronousObserverScheduler(),
    ...overrides,
  }
}
