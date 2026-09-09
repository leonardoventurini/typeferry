import { minimongoComponents, type MinimongoComponents } from './components'
import { Cursor, type CursorCollection } from './cursor'
import type { DocumentStore } from './document-store'
import { MinimongoError } from './errors'
import { assertMinimongoId } from './identity'
import { ObjectID } from './object-id'
import type {
  FindOptions,
  InsertDocument,
  MaterializedDocument,
  MinimongoId,
  Modifier,
  Selector,
  UpdateOptions,
  UpsertResult,
} from './types'

type Stored<TSchema extends object, TId extends MinimongoId> =
  MaterializedDocument<TSchema, TId> & Record<string, unknown>

type MutationCallback<TResult> = (error: Error | null, result?: TResult) => void

export interface LocalCollectionOptions {
  readonly components?: Partial<MinimongoComponents>
}

/** Strict, modular clone of Meteor's in-memory LocalCollection. */
export class LocalCollection<
  TSchema extends object = Record<string, unknown>,
  TId extends MinimongoId = MinimongoId,
> implements CursorCollection<Stored<TSchema, TId>> {
  static _useOID = false

  readonly components: MinimongoComponents
  readonly name: string | undefined
  private readonly store: DocumentStore<TId, Stored<TSchema, TId>>
  private readonly observers = new Set<() => void>()
  private originals: DocumentStore<TId, Stored<TSchema, TId> | undefined> | undefined
  private paused = false

  constructor(
    name?: string,
    options: LocalCollectionOptions = {},
  ) {
    this.name = name
    this.components = minimongoComponents(options.components ?? {})
    this.store = this.components.documentStoreFactory.create<TId, Stored<TSchema, TId>>()
  }

  documents(): Iterable<Stored<TSchema, TId>> {
    return Array.from(this.store.entries(), ([, document]) => document)
  }

  addObserver(observer: () => void): () => void {
    this.observers.add(observer)

    return () => this.observers.delete(observer)
  }

  find<TOutput = Stored<TSchema, TId>>(
    selector: Selector<Stored<TSchema, TId>> | undefined = {},
    options: FindOptions<Stored<TSchema, TId>, TOutput> = {},
  ): Cursor<Stored<TSchema, TId>, TOutput> {
    return new Cursor(this, selector, options)
  }

  findOne<TOutput = Stored<TSchema, TId>>(
    selector: Selector<Stored<TSchema, TId>> | undefined = {},
    options: FindOptions<Stored<TSchema, TId>, TOutput> = {},
  ): TOutput | undefined {
    return this.find(selector, { ...options, limit: 1 }).fetch()[0]
  }

  findOneAsync<TOutput = Stored<TSchema, TId>>(
    selector: Selector<Stored<TSchema, TId>> | undefined = {},
    options: FindOptions<Stored<TSchema, TId>, TOutput> = {},
  ): Promise<TOutput | undefined> {
    return Promise.resolve(this.findOne(selector, options))
  }

  countDocuments(
    selector: Selector<Stored<TSchema, TId>> | undefined = {},
    options: FindOptions<Stored<TSchema, TId>> = {},
  ): Promise<number> {
    return this.find(selector, options).countAsync()
  }

  estimatedDocumentCount(options: FindOptions<Stored<TSchema, TId>> = {}): Promise<number> {
    return this.find({}, options).countAsync()
  }

  insert(document: InsertDocument<TSchema, TId>, callback?: MutationCallback<TId>): TId {
    const cloned = this.components.values.clone(document) as Record<string, unknown>
    const id = this.prepareInsert(cloned)

    this.notifyObservers()
    this.deferCallback(callback, id)

    return id
  }

  async insertAsync(document: InsertDocument<TSchema, TId>, callback?: MutationCallback<TId>): Promise<TId> {
    const cloned = this.components.values.clone(document) as Record<string, unknown>
    const id = this.prepareInsert(cloned)

    await this.notifyObserversAsync()
    this.deferCallback(callback, id)

    return id
  }

  remove(selector: Selector<Stored<TSchema, TId>>, callback?: MutationCallback<number>): number {
    const ids = this.matchedIds(selector)
    for (const id of ids) {
      const document = this.store.get(id)
      this.saveOriginal(id, document)
      this.store.delete(id)
    }
    this.notifyObservers()
    this.deferCallback(callback, ids.length)

    return ids.length
  }

  async removeAsync(selector: Selector<Stored<TSchema, TId>>, callback?: MutationCallback<number>): Promise<number> {
    const ids = this.matchedIds(selector)
    for (const id of ids) {
      const document = this.store.get(id)
      this.saveOriginal(id, document)
      this.store.delete(id)
    }
    await this.notifyObserversAsync()
    this.deferCallback(callback, ids.length)

    return ids.length
  }

  update(
    selector: Selector<Stored<TSchema, TId>>,
    modifier: Modifier<Stored<TSchema, TId>> | Partial<Stored<TSchema, TId>>,
    options: UpdateOptions<TId> = {},
    callback?: MutationCallback<number | UpsertResult<TId>>,
  ): number | UpsertResult<TId> {
    const result = this.applyUpdate(selector, modifier, options)

    this.notifyObservers()
    this.deferCallback(callback, result)

    return result
  }

  async updateAsync(
    selector: Selector<Stored<TSchema, TId>>,
    modifier: Modifier<Stored<TSchema, TId>> | Partial<Stored<TSchema, TId>>,
    options: UpdateOptions<TId> = {},
    callback?: MutationCallback<number | UpsertResult<TId>>,
  ): Promise<number | UpsertResult<TId>> {
    const result = this.applyUpdate(selector, modifier, options)

    await this.notifyObserversAsync()
    this.deferCallback(callback, result)

    return result
  }

  upsert(
    selector: Selector<Stored<TSchema, TId>>,
    modifier: Modifier<Stored<TSchema, TId>> | Partial<Stored<TSchema, TId>>,
    options: Omit<UpdateOptions<TId>, 'upsert' | '_returnObject'> = {},
    callback?: MutationCallback<UpsertResult<TId>>,
  ): UpsertResult<TId> {
    const result = this.update(
      selector,
      modifier,
      { ...options, upsert: true, _returnObject: true },
      callback as MutationCallback<number | UpsertResult<TId>>,
    )

    return result as UpsertResult<TId>
  }

  async upsertAsync(
    selector: Selector<Stored<TSchema, TId>>,
    modifier: Modifier<Stored<TSchema, TId>> | Partial<Stored<TSchema, TId>>,
    options: Omit<UpdateOptions<TId>, 'upsert' | '_returnObject'> = {},
    callback?: MutationCallback<UpsertResult<TId>>,
  ): Promise<UpsertResult<TId>> {
    const result = await this.updateAsync(
      selector,
      modifier,
      { ...options, upsert: true, _returnObject: true },
      callback as MutationCallback<number | UpsertResult<TId>>,
    )

    return result as UpsertResult<TId>
  }

  pauseObservers(): void {
    this.paused = true
  }

  resumeObserversClient(): void {
    if (!this.paused) return
    this.paused = false
    this.notifyObservers()
  }

  async resumeObserversServer(): Promise<void> {
    if (!this.paused) return
    this.paused = false
    await this.notifyObserversAsync()
  }

  saveOriginals(): void {
    if (this.originals) throw new Error('Called saveOriginals twice without retrieveOriginals')
    this.originals = this.components.documentStoreFactory.create<TId, Stored<TSchema, TId> | undefined>()
  }

  retrieveOriginals(): DocumentStore<TId, Stored<TSchema, TId> | undefined> {
    if (!this.originals) throw new Error('Called retrieveOriginals without saveOriginals')
    const originals = this.originals

    this.originals = undefined

    return originals
  }

  private prepareInsert(document: Record<string, unknown>): TId {
    if (!Object.hasOwn(document, '_id')) {
      document['_id'] = LocalCollection._useOID
        ? new ObjectID()
        : this.components.randomId()
    }
    const id = document['_id']

    assertMinimongoId(id)
    if (typeof id === 'string' && id.length === 0) throw new MinimongoError('Meteor does not allow empty string IDs')
    if (this.store.has(id as TId)) throw new MinimongoError(`Duplicate _id '${String(id)}'`)
    this.saveOriginal(id as TId, undefined)
    this.store.set(id as TId, document as Stored<TSchema, TId>)

    return id as TId
  }

  private matchedIds(selector: Selector<Stored<TSchema, TId>>): TId[] {
    const matcher = this.components.query.matcher(selector, {
      isUpdate: true,
      allowJavascriptWhere: this.components.allowJavascriptWhere,
    })
    const result: TId[] = []
    for (const [id, document] of this.store.entries()) {
      if (matcher.documentMatches(document).result) result.push(id)
    }

    return result
  }

  private applyUpdate(
    selector: Selector<Stored<TSchema, TId>>,
    modifier: Modifier<Stored<TSchema, TId>> | Partial<Stored<TSchema, TId>>,
    options: UpdateOptions<TId>,
  ): number | UpsertResult<TId> {
    const matcher = this.components.query.matcher(selector, {
      isUpdate: true,
      allowJavascriptWhere: this.components.allowJavascriptWhere,
    })
    let numberAffected = 0
    for (const [id, document] of this.store.entries()) {
      const match = matcher.documentMatches(document)
      if (!match.result) continue
      this.saveOriginal(id, document)
      this.components.mutations.modify(document, modifier, {
        ...(match.arrayIndices ? { arrayIndices: match.arrayIndices } : {}),
        now: this.components.now,
      })
      numberAffected += 1
      if (!options.multi) break
    }

    let insertedId: TId | undefined
    if (numberAffected === 0 && options.upsert) {
      const document = this.components.mutations.createUpsert<Stored<TSchema, TId>>(selector, modifier)
      if (!document['_id'] && options.insertedId !== undefined) document['_id'] = options.insertedId
      insertedId = this.prepareInsert(document)
      numberAffected = 1
    }

    if (options._returnObject) {
      return {
        numberAffected,
        ...(insertedId !== undefined ? { insertedId } : {}),
      }
    }

    return numberAffected
  }

  private saveOriginal(id: TId, document: Stored<TSchema, TId> | undefined): void {
    if (!this.originals || this.originals.has(id)) return
    this.originals.set(id, document === undefined ? undefined : this.components.values.clone(document))
  }

  private notifyObservers(): void {
    if (this.paused) return
    for (const observer of this.observers) observer()
    void this.components.scheduler.drain()
  }

  private async notifyObserversAsync(): Promise<void> {
    if (this.paused) return
    for (const observer of this.observers) observer()
    await this.components.scheduler.drain()
  }

  private deferCallback<TResult>(callback: MutationCallback<TResult> | undefined, result: TResult): void {
    if (callback) this.components.scheduler.defer(() => callback(null, result))
  }
}
