import { LOCAL_STORE_RUNTIME, localStoreRuntime } from './components'
import { Cursor, type CursorCollection } from './cursor'
import type { DocumentStore } from './document-store'
import { LocalCollectionError } from './errors'
import { TypedEventEmitter } from './events'
import { deepFreeze, type DeepReadonly } from './immutable'
import { assertLocalId } from './identity'
import { assertValidFieldNames } from './modifier'
import type {
  FindOptions,
  InsertDocument,
  MaterializedDocument,
  Modifier,
  Selector,
  TransformedDocument,
  UpdateOptions,
  UpsertOptions,
  UpsertResult,
} from './types'

type Stored<TSchema extends object> = MaterializedDocument<TSchema, string>

export interface CollectionInsertEvent<TDocument extends object> {
  readonly document: TDocument
}

export interface CollectionUpdateEvent<TDocument extends object> {
  readonly previous: TDocument
  readonly document: TDocument
}

export interface CollectionRemoveEvent<TDocument extends object> {
  readonly document: TDocument
}

type CollectionEvents<TDocument extends object> = {
  insert: readonly [event: CollectionInsertEvent<TDocument>]
  update: readonly [event: CollectionUpdateEvent<TDocument>]
  remove: readonly [event: CollectionRemoveEvent<TDocument>]
}

/** A typed, immutable, event-driven local document collection. */
export class LocalCollection<
  TSchema extends object = Record<string, unknown>,
> extends TypedEventEmitter<CollectionEvents<Stored<TSchema>>>
  implements CursorCollection<Stored<TSchema>> {
  readonly [LOCAL_STORE_RUNTIME] = localStoreRuntime
  readonly name: string | undefined
  private readonly store: DocumentStore<string, Stored<TSchema>>
  private readonly observers = new Set<() => void>()

  constructor(name?: string) {
    super()
    this.name = name
    this.store = localStoreRuntime.documentStoreFactory.create<string, Stored<TSchema>>()
  }

  documents(): Iterable<Stored<TSchema>> {
    return Array.from(this.store.entries(), ([, document]) => document)
  }

  addObserver(observer: () => void): () => void {
    this.observers.add(observer)

    return () => this.observers.delete(observer)
  }

  find<TOutput extends object = Stored<TSchema>>(
    selector?: Selector<Stored<TSchema>>,
    options: FindOptions<Stored<TSchema>, TOutput> = {},
  ): Cursor<Stored<TSchema>, TOutput> {
    const effectiveSelector = arguments.length === 0 ? {} : selector

    return new Cursor(this, effectiveSelector, options)
  }

  findOne<TOutput extends object = Stored<TSchema>>(
    selector?: Selector<Stored<TSchema>>,
    options: FindOptions<Stored<TSchema>, TOutput> = {},
  ): DeepReadonly<TransformedDocument<Stored<TSchema>, TOutput>> | undefined {
    const effectiveSelector = arguments.length === 0 ? {} : selector

    return this.find(effectiveSelector, { ...options, limit: 1 }).fetch()[0]
  }

  findOneAsync<TOutput extends object = Stored<TSchema>>(
    selector?: Selector<Stored<TSchema>>,
    options: FindOptions<Stored<TSchema>, TOutput> = {},
  ): Promise<DeepReadonly<TransformedDocument<Stored<TSchema>, TOutput>> | undefined> {
    return Promise.resolve(this.findOne(selector, options))
  }

  countDocuments(
    selector: Selector<Stored<TSchema>> | undefined = {},
    options: FindOptions<Stored<TSchema>> = {},
  ): Promise<number> {
    return this.find(selector, options).countAsync()
  }

  estimatedDocumentCount(options: FindOptions<Stored<TSchema>> = {}): Promise<number> {
    return this.find({}, options).countAsync()
  }

  insert(document: InsertDocument<TSchema, string>): string {
    const mutable = localStoreRuntime.values.clone(document) as Record<string, unknown>
    const stored = this.prepareInsert(mutable)

    this.emit('insert', deepFreeze({ document: stored }))
    this.notifyObservers()

    return stored._id
  }

  insertAsync(document: InsertDocument<TSchema, string>): Promise<string> {
    return Promise.resolve(this.insert(document))
  }

  remove(selector: Selector<Stored<TSchema>>): number {
    const documents = this.matchedDocuments(selector)

    for (const document of documents) this.store.delete(document._id)
    for (const document of documents) this.emit('remove', deepFreeze({ document }))
    this.notifyObservers()

    return documents.length
  }

  removeAsync(selector: Selector<Stored<TSchema>>): Promise<number> {
    return Promise.resolve(this.remove(selector))
  }

  update(
    selector: Selector<Stored<TSchema>>,
    modifier: Modifier<Stored<TSchema>> | Partial<Stored<TSchema>>,
    options: UpdateOptions<string> = {},
  ): number {
    const matches = this.matchedDocuments(selector)
    const updates: CollectionUpdateEvent<Stored<TSchema>>[] = []
    let numberAffected = 0

    for (const previous of matches) {
      const mutable = localStoreRuntime.values.clone(previous) as Record<string, unknown>
      const match = localStoreRuntime.query.matcher(selector, { isUpdate: true }).documentMatches(previous)

      localStoreRuntime.mutations.modify(mutable, modifier, {
        ...(match.arrayIndices ? { arrayIndices: match.arrayIndices } : {}),
        now: localStoreRuntime.now,
      })
      const document = deepFreeze(mutable) as Stored<TSchema>

      this.store.set(previous._id, document)
      updates.push(deepFreeze({ previous, document }))
      numberAffected += 1
      if (!options.multi) break
    }

    if (numberAffected > 0) {
      for (const event of updates) this.emit('update', event)
      this.notifyObservers()
    }

    return numberAffected
  }

  updateAsync(
    selector: Selector<Stored<TSchema>>,
    modifier: Modifier<Stored<TSchema>> | Partial<Stored<TSchema>>,
    options: UpdateOptions<string> = {},
  ): Promise<number> {
    return Promise.resolve(this.update(selector, modifier, options))
  }

  upsert(
    selector: Selector<Stored<TSchema>>,
    modifier: Modifier<Stored<TSchema>> | Partial<Stored<TSchema>>,
    options: UpsertOptions<string> = {},
  ): UpsertResult<string> {
    const numberAffected = this.update(selector, modifier, options)

    if (numberAffected > 0) return deepFreeze({ numberAffected })

    const document = localStoreRuntime.mutations.createUpsert<Record<string, unknown>>(
      selector,
      modifier as Modifier<Record<string, unknown>> | Partial<Record<string, unknown>>,
    )
    if (!document._id && options.insertedId !== undefined) document._id = options.insertedId
    const stored = this.prepareInsert(document)

    this.emit('insert', deepFreeze({ document: stored }))
    this.notifyObservers()

    return deepFreeze({ numberAffected: 1, insertedId: stored._id })
  }

  upsertAsync(
    selector: Selector<Stored<TSchema>>,
    modifier: Modifier<Stored<TSchema>> | Partial<Stored<TSchema>>,
    options: UpsertOptions<string> = {},
  ): Promise<UpsertResult<string>> {
    return Promise.resolve(this.upsert(selector, modifier, options))
  }

  private prepareInsert(document: Record<string, unknown>): Stored<TSchema> {
    assertValidFieldNames(document)
    document._id ??= localStoreRuntime.randomId()
    assertLocalId(document._id)
    if (this.store.has(document._id)) {
      throw new LocalCollectionError(`Duplicate _id '${document._id}'`)
    }

    const stored = deepFreeze(document) as Stored<TSchema>

    this.store.set(stored._id, stored)

    return stored
  }

  private matchedDocuments(selector: Selector<Stored<TSchema>>): Stored<TSchema>[] {
    const matcher = localStoreRuntime.query.matcher(selector, { isUpdate: true })

    return Array.from(this.store.entries(), ([, document]) => document)
      .filter(document => matcher.documentMatches(document).result)
  }

  private notifyObservers(): void {
    for (const observer of this.observers) observer()
  }
}
