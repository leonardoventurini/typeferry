import { LOCAL_STORE_RUNTIME, type LocalStoreRuntime } from './components'
import { TypedEventEmitter } from './events'
import { deepFreeze, type DeepReadonly } from './immutable'
import { Matcher } from './matcher'
import type { Sorter } from './sorter'
import { wrapTransform } from './transform'
import type {
  FindOptions,
  MaterializedDocument,
  Selector,
  TransformedDocument,
} from './types'

export interface CursorCollection<TDocument extends object> {
  readonly name: string | undefined
  readonly [LOCAL_STORE_RUNTIME]: LocalStoreRuntime
  documents(): Iterable<TDocument>
  addObserver(observer: () => void): () => void
}

export interface CursorAddedEvent<TDocument extends object> {
  readonly document: TDocument
  readonly index: number
}

export interface CursorChangedEvent<TDocument extends object> {
  readonly previous: TDocument
  readonly document: TDocument
  readonly previousIndex: number
  readonly index: number
}

export interface CursorRemovedEvent<TDocument extends object> {
  readonly document: TDocument
  readonly index: number
}

type CursorEvents<TDocument extends object> = {
  change: readonly [documents: readonly TDocument[]]
  added: readonly [event: CursorAddedEvent<TDocument>]
  changed: readonly [event: CursorChangedEvent<TDocument>]
  removed: readonly [event: CursorRemovedEvent<TDocument>]
}

/** A lazily evaluated query with event-driven immutable result snapshots. */
export class Cursor<
  TDocument extends object,
  TOutput extends object = TDocument,
> extends TypedEventEmitter<CursorEvents<DeepReadonly<TransformedDocument<TDocument, TOutput>>>>
  implements Iterable<DeepReadonly<TransformedDocument<TDocument, TOutput>>>,
  AsyncIterable<DeepReadonly<TransformedDocument<TDocument, TOutput>>> {
  readonly matcher: Matcher<TDocument>
  private readonly projection: (document: TDocument) => TDocument
  private readonly transform: ((document: TDocument) => TransformedDocument<TDocument, TOutput>) | undefined
  private readonly sorter: Sorter<TDocument> | undefined
  private readonly skip: number
  private readonly limit: number | undefined
  private previous: readonly DeepReadonly<TransformedDocument<TDocument, TOutput>>[] | undefined
  private removeObserver: (() => void) | undefined
  private listenerCount = 0

  constructor(
    private readonly collection: CursorCollection<TDocument>,
    selector: Selector<TDocument> | unknown,
    private readonly options: FindOptions<TDocument, TOutput> = {},
  ) {
    super()
    this.matcher = collection[LOCAL_STORE_RUNTIME].query.matcher(selector, {
      ...(options.collation ? { collation: options.collation } : {}),
    })
    this.sorter = options.sort
      ? collection[LOCAL_STORE_RUNTIME].query.sorter(options.sort, options.collation)
      : this.matcher.hasGeoQuery()
        ? collection[LOCAL_STORE_RUNTIME].query.sorter([], options.collation)
        : undefined
    this.projection = collection[LOCAL_STORE_RUNTIME].query.projection(options.projection ?? options.fields)
    this.transform = wrapTransform(options.transform, collection[LOCAL_STORE_RUNTIME].values)
    this.skip = options.skip ?? 0
    this.limit = options.limit
  }

  count(): number {
    return this.rawDocuments().length
  }

  countAsync(): Promise<number> {
    return Promise.resolve(this.count())
  }

  fetch(): readonly DeepReadonly<TransformedDocument<TDocument, TOutput>>[] {
    return deepFreeze(this.rawDocuments().map(document => this.outputDocument(document)))
  }

  fetchAsync(): Promise<readonly DeepReadonly<TransformedDocument<TDocument, TOutput>>[]> {
    return Promise.resolve(this.fetch())
  }

  forEach(
    callback: (
      document: DeepReadonly<TransformedDocument<TDocument, TOutput>>,
      index: number,
      cursor: this,
    ) => void,
    thisArg?: unknown,
  ): void {
    this.fetch().forEach((document, index) => callback.call(thisArg, document, index, this))
  }

  map<TResult>(
    callback: (
      document: DeepReadonly<TransformedDocument<TDocument, TOutput>>,
      index: number,
      cursor: this,
    ) => TResult,
    thisArg?: unknown,
  ): TResult[] {
    return this.fetch().map((document, index) => callback.call(thisArg, document, index, this))
  }

  [Symbol.iterator](): Iterator<DeepReadonly<TransformedDocument<TDocument, TOutput>>> {
    return this.fetch()[Symbol.iterator]()
  }

  [Symbol.asyncIterator](): AsyncIterator<DeepReadonly<TransformedDocument<TDocument, TOutput>>> {
    const iterator = this[Symbol.iterator]()

    return { next: async () => iterator.next() }
  }

  /** Stops observing collection mutations while retaining current listeners. */
  stop(): void {
    this.removeObserver?.()
    this.removeObserver = undefined
    this.previous = undefined
  }

  protected override onListenerAdded(): void {
    this.listenerCount += 1
    if (this.removeObserver || this.options.reactive === false) return

    this.previous = this.fetch()
    this.removeObserver = this.collection.addObserver(() => this.handleMutation())
  }

  protected override onListenerRemoved(): void {
    this.listenerCount = Math.max(0, this.listenerCount - 1)
    if (this.listenerCount === 0) this.stop()
  }

  private handleMutation(): void {
    const previous = this.previous ?? []
    const current = this.fetch()
    const previousById = new Map(previous.map((document, index) => [this.idOf(document), { document, index }]))
    const currentById = new Map(current.map((document, index) => [this.idOf(document), { document, index }]))
    let changed = false

    for (const [id, entry] of previousById) {
      if (currentById.has(id)) continue
      this.emit('removed', deepFreeze({ document: entry.document, index: entry.index }))
      changed = true
    }
    for (const [id, entry] of currentById) {
      const old = previousById.get(id)
      if (!old) {
        this.emit('added', deepFreeze({ document: entry.document, index: entry.index }))
        changed = true
      } else if (
        old.document !== entry.document
        && !this.collection[LOCAL_STORE_RUNTIME].values.equals(old.document, entry.document)
      ) {
        this.emit('changed', deepFreeze({
          previous: old.document,
          document: entry.document,
          previousIndex: old.index,
          index: entry.index,
        }))
        changed = true
      } else if (old.index !== entry.index) {
        changed = true
      }
    }

    this.previous = current
    if (changed) this.emit('change', current)
  }

  private rawDocuments(): TDocument[] {
    const distances = new Map<unknown, number>()
    const documents: TDocument[] = []

    for (const document of this.collection.documents()) {
      const result = this.matcher.documentMatches(document)

      if (!result.result) continue
      documents.push(document)
      if (result.distance !== undefined) distances.set(this.idOf(document), result.distance)
    }
    if (this.sorter) documents.sort(this.sorter.getComparator({ distances }))

    return documents.slice(this.skip, this.limit === undefined ? undefined : this.skip + this.limit)
  }

  private outputDocument(document: TDocument): DeepReadonly<TransformedDocument<TDocument, TOutput>> {
    const hasProjection = Object.keys(this.options.projection ?? this.options.fields ?? {}).length > 0
    const projected = hasProjection ? this.projection(document) : document
    const output = this.transform ? this.transform(projected) : projected

    return deepFreeze(output) as DeepReadonly<TransformedDocument<TDocument, TOutput>>
  }

  private idOf(document: object): string {
    return String(Reflect.get(document, '_id'))
  }
}

export type CollectionCursor<
  TSchema extends object,
  TOutput extends object = MaterializedDocument<TSchema, string>,
> = Cursor<MaterializedDocument<TSchema, string>, TOutput>
