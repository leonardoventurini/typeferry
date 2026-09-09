import type { MinimongoComponents } from './components'
import type { ChangeCallbacks } from './diff'
import { Matcher } from './matcher'
import type { Sorter } from './sorter'
import type {
  FindOptions,
  MaterializedDocument,
  MinimongoId,
  ObserveCallbacks,
  ObserveChangesCallbacks,
  ObserveHandle,
  Selector,
} from './types'

export interface CursorCollection<TDocument extends Record<string, unknown>> {
  readonly name: string | undefined
  readonly components: MinimongoComponents
  documents(): Iterable<TDocument>
  addObserver(observer: () => void): () => void
  isPaused(): boolean
}

class ObserveHandleState implements ObserveHandle {
  isReady = false
  isReadyPromise: Promise<void> = Promise.resolve()

  constructor(
    readonly collection: unknown,
    readonly stop: () => void,
  ) {}
}

function validateObserveCallbacks<TDocument>(callbacks: ObserveCallbacks<TDocument>): boolean {
  if (callbacks.added && callbacks.addedAt) throw new Error('Please specify only one of added() and addedAt()')
  if (callbacks.changed && callbacks.changedAt) throw new Error('Please specify only one of changed() and changedAt()')
  if (callbacks.removed && callbacks.removedAt) throw new Error('Please specify only one of removed() and removedAt()')

  return Boolean(callbacks.addedAt || callbacks.changedAt || callbacks.removedAt || callbacks.movedTo)
}

/** A lazily evaluated, observable query over one LocalCollection. */
export class Cursor<
  TDocument extends Record<string, unknown>,
  TOutput = TDocument,
> implements Iterable<TOutput>, AsyncIterable<TOutput> {
  readonly matcher: Matcher<TDocument>
  private readonly projection: (document: TDocument) => TDocument
  private readonly transform: ((document: TDocument) => TOutput) | undefined
  private readonly sorter: Sorter<TDocument> | undefined
  private readonly skip: number
  private readonly limit: number | undefined

  constructor(
    private readonly collection: CursorCollection<TDocument>,
    selector: Selector<TDocument> | unknown,
    private readonly options: FindOptions<TDocument, TOutput> = {},
  ) {
    this.matcher = collection.components.query.matcher(selector, {
      ...(options.collation ? { collation: options.collation } : {}),
      allowJavascriptWhere: collection.components.allowJavascriptWhere,
    })
    this.sorter = options.sort
      ? collection.components.query.sorter(options.sort, options.collation)
      : this.matcher.hasGeoQuery()
        ? collection.components.query.sorter([], options.collation)
        : undefined
    this.projection = collection.components.query.projection(options.projection ?? options.fields)
    this.transform = options.transform ?? undefined
    this.skip = options.skip ?? 0
    this.limit = options.limit
  }

  count(): number {
    return this.rawDocuments().length
  }

  countAsync(): Promise<number> {
    return Promise.resolve(this.count())
  }

  fetch(): TOutput[] {
    return this.rawDocuments().map(document => this.outputDocument(document))
  }

  fetchAsync(): Promise<TOutput[]> {
    return Promise.resolve(this.fetch())
  }

  forEach(callback: (document: TOutput, index: number, cursor: this) => void, thisArg?: unknown): void {
    this.fetch().forEach((document, index) => callback.call(thisArg, document, index, this))
  }

  async forEachAsync(
    callback: (document: TOutput, index: number, cursor: this) => void | Promise<void>,
    thisArg?: unknown,
  ): Promise<void> {
    let index = 0
    for (const document of this.fetch()) {
      await callback.call(thisArg, document, index, this)
      index += 1
    }
  }

  map<TResult>(callback: (document: TOutput, index: number, cursor: this) => TResult, thisArg?: unknown): TResult[] {
    return this.fetch().map((document, index) => callback.call(thisArg, document, index, this))
  }

  async mapAsync<TResult>(
    callback: (document: TOutput, index: number, cursor: this) => TResult | Promise<TResult>,
    thisArg?: unknown,
  ): Promise<TResult[]> {
    const result: TResult[] = []
    await this.forEachAsync(async (document, index) => {
      result.push(await callback.call(thisArg, document, index, this))
    })

    return result
  }

  getTransform(): ((document: TDocument) => TOutput) | undefined {
    return this.transform
  }

  observe(callbacks: ObserveCallbacks<TOutput>): ObserveHandle {
    const ordered = validateObserveCallbacks(callbacks)
    const documents = new Map<string, TDocument>()
    const order: MinimongoId[] = []
    const codec = this.collection.components.identities
    const values = this.collection.components.values
    const transformed = (document: TDocument): TOutput =>
      this.transform ? this.transform(values.clone(document)) : values.clone(document) as unknown as TOutput
    const materialized = (
      id: MinimongoId,
      fields: Partial<Omit<TDocument, '_id'>>,
    ): TDocument => ({ ...fields, _id: id }) as unknown as TDocument

    const changeCallbacks: ObserveChangesCallbacks<TDocument> = ordered
      ? {
          addedBefore: (id, fields, before) => {
            const document = materialized(id, fields)
            const index = before === null
              ? order.length
              : order.findIndex(value => codec.stringify(value) === codec.stringify(before))
            order.splice(index < 0 ? order.length : index, 0, id)
            documents.set(codec.stringify(id), document)
            return callbacks.addedAt?.(transformed(document), index < 0 ? order.length - 1 : index, before)
          },
          changed: (id, fields) => {
            const key = codec.stringify(id)
            const oldDocument = documents.get(key)
            if (!oldDocument) return
            const raw = values.clone(oldDocument)
            for (const [field, value] of Object.entries(fields)) {
              if (value === undefined) Reflect.deleteProperty(raw, field)
              else Reflect.set(raw, field, values.clone(value))
            }
            const newDocument = raw as TDocument
            documents.set(key, newDocument)
            const index = order.findIndex(value => codec.stringify(value) === key)
            return callbacks.changedAt?.(transformed(newDocument), transformed(oldDocument), index)
              ?? callbacks.changed?.(transformed(newDocument), transformed(oldDocument))
          },
          removed: id => {
            const key = codec.stringify(id)
            const document = documents.get(key)
            const index = order.findIndex(value => codec.stringify(value) === key)
            if (!document) return
            documents.delete(key)
            if (index >= 0) order.splice(index, 1)
            return callbacks.removedAt?.(transformed(document), index)
              ?? callbacks.removed?.(transformed(document))
          },
          movedBefore: (id, before) => {
            const key = codec.stringify(id)
            const from = order.findIndex(value => codec.stringify(value) === key)
            if (from < 0) return
            const [moved] = order.splice(from, 1)
            const to = before === null
              ? order.length
              : order.findIndex(value => codec.stringify(value) === codec.stringify(before))
            order.splice(to < 0 ? order.length : to, 0, moved!)
            const document = documents.get(key)
            if (document) return callbacks.movedTo?.(transformed(document), from, to < 0 ? order.length - 1 : to, before)
          },
        }
      : {
          added: (id, fields) => {
            const document = materialized(id, fields)
            documents.set(codec.stringify(id), document)

            return callbacks.added?.(transformed(document))
          },
          changed: (id, fields) => {
            const key = codec.stringify(id)
            const oldDocument = documents.get(key)
            if (!oldDocument) return
            const raw = values.clone(oldDocument)
            for (const [field, value] of Object.entries(fields)) {
              if (value === undefined) Reflect.deleteProperty(raw, field)
              else Reflect.set(raw, field, values.clone(value))
            }
            const newDocument = raw as TDocument
            documents.set(key, newDocument)

            return callbacks.changed?.(transformed(newDocument), transformed(oldDocument))
          },
          removed: id => {
            const key = codec.stringify(id)
            const document = documents.get(key)
            documents.delete(key)
            if (document) return callbacks.removed?.(transformed(document))
          },
        }

    return this.observeChanges(changeCallbacks)
  }

  observeAsync(callbacks: ObserveCallbacks<TOutput>): Promise<ObserveHandle> {
    return Promise.resolve(this.observe(callbacks))
  }

  observeChanges(callbacks: ObserveChangesCallbacks<TDocument>): ObserveHandle {
    if (callbacks.added && callbacks.addedBefore) throw new Error('Please specify only one of added() and addedBefore()')
    const ordered = Boolean(callbacks.addedBefore || callbacks.movedBefore)
    if (!ordered && (this.skip || this.limit)) {
      throw new Error("Must use an ordered observe with skip or limit (i.e. 'addedBefore' for observeChanges or 'addedAt' for observe, instead of 'added').")
    }
    const projectionOption = this.options.projection ?? this.options.fields
    if (projectionOption?._id === 0 || projectionOption?._id === false) {
      throw new Error('You may not observe a cursor with {fields: {_id: 0}}')
    }

    const initial = this.projectedDocuments()
    let previous = this.collection.isPaused() ? [] : initial
    let active = true
    const queued: ChangeCallbacks<TDocument> = {}
    for (const name of ['added', 'addedBefore', 'changed', 'removed', 'movedBefore'] as const) {
      const callback = callbacks[name]
      if (callback) {
        Reflect.set(queued, name, (...args: unknown[]) => {
          this.collection.components.scheduler.queue(
            () => Reflect.apply(callback, callbacks, args) as void | Promise<void>,
          )
        })
      }
    }
    const suppressInitial = Boolean((callbacks as ObserveChangesCallbacks<TDocument> & { _suppress_initial?: boolean })._suppress_initial)
    if (!suppressInitial && !this.collection.isPaused()) {
      for (const document of initial) {
        const id = document['_id'] as MinimongoId
        const fields = this.collection.components.values.clone(document)
        delete fields['_id']
        if (ordered) queued.addedBefore?.(id, fields, null)
        else queued.added?.(id, fields)
      }
    }

    const removeObserver = this.options.reactive === false
      ? () => undefined
      : this.collection.addObserver(() => {
          if (!active) return
          const current = this.projectedDocuments()
          this.collection.components.observers.diff(
            ordered,
            previous,
            current,
            queued,
            this.collection.components.identities,
            this.collection.components.values,
          )
          previous = current
        })
    const handle = new ObserveHandleState(this.collection, () => {
      active = false
      removeObserver()
    })
    const drained = this.collection.components.scheduler.drain()
    if (drained instanceof Promise) {
      handle.isReadyPromise = drained.then(() => {
        handle.isReady = true
      })
    } else {
      handle.isReady = true
      handle.isReadyPromise = Promise.resolve()
    }

    return handle
  }

  async observeChangesAsync(callbacks: ObserveChangesCallbacks<TDocument>): Promise<ObserveHandle> {
    const handle = this.observeChanges(callbacks)
    await handle.isReadyPromise

    return handle
  }

  [Symbol.iterator](): Iterator<TOutput> {
    return this.fetch()[Symbol.iterator]()
  }

  [Symbol.asyncIterator](): AsyncIterator<TOutput> {
    const iterator = this[Symbol.iterator]()

    return {
      next: async () => iterator.next(),
    }
  }

  private rawDocuments(): TDocument[] {
    const distances = new Map<unknown, number>()
    const documents: TDocument[] = []
    for (const document of this.collection.documents()) {
      const result = this.matcher.documentMatches(document)
      if (!result.result) continue
      documents.push(document)
      if (result.distance !== undefined) distances.set(document['_id'], result.distance)
    }
    if (this.sorter) documents.sort(this.sorter.getComparator({ distances }))

    return documents.slice(this.skip, this.limit === undefined ? undefined : this.skip + this.limit)
  }

  private projectedDocuments(): TDocument[] {
    return this.rawDocuments().map(document => this.projection(document))
  }

  private outputDocument(document: TDocument): TOutput {
    const projected = this.projection(document)

    return this.transform ? this.transform(projected) : projected as unknown as TOutput
  }
}

export type CollectionCursor<
  TSchema extends object,
  TId extends MinimongoId,
  TOutput = MaterializedDocument<TSchema, TId>,
> = Cursor<MaterializedDocument<TSchema, TId> & Record<string, unknown>, TOutput>
