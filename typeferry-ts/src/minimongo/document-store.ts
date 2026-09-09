import type { IdentityCodec } from './identity'
import type { ValueSemantics } from './value-semantics'

export interface DocumentStore<TId, TDocument> {
  readonly size: number
  has(id: TId): boolean
  get(id: TId): TDocument | undefined
  set(id: TId, document: TDocument): void
  delete(id: TId): boolean
  clear(): void
  entries(): IterableIterator<readonly [TId, TDocument]>
  clone(): DocumentStore<TId, TDocument>
}

export interface DocumentStoreFactory {
  create<TId, TDocument>(): DocumentStore<TId, TDocument>
}

/** Insertion-ordered storage used by the Meteor compatibility profile. */
export class MemoryDocumentStore<TId, TDocument> implements DocumentStore<TId, TDocument> {
  private readonly documents = new Map<string, TDocument>()
  private readonly identities = new Map<string, TId>()

  constructor(
    private readonly codec: IdentityCodec<unknown>,
    private readonly values: ValueSemantics,
  ) {}

  get size(): number {
    return this.documents.size
  }

  has(id: TId): boolean {
    return this.documents.has(this.codec.stringify(id))
  }

  get(id: TId): TDocument | undefined {
    return this.documents.get(this.codec.stringify(id))
  }

  set(id: TId, document: TDocument): void {
    const key = this.codec.stringify(id)

    this.identities.set(key, id)
    this.documents.set(key, document)
  }

  delete(id: TId): boolean {
    const key = this.codec.stringify(id)

    this.identities.delete(key)

    return this.documents.delete(key)
  }

  clear(): void {
    this.documents.clear()
    this.identities.clear()
  }

  *entries(): IterableIterator<readonly [TId, TDocument]> {
    for (const [key, document] of this.documents) {
      const id = this.identities.get(key)
      if (id !== undefined) yield [id, document] as const
    }
  }

  clone(): MemoryDocumentStore<TId, TDocument> {
    const result = new MemoryDocumentStore<TId, TDocument>(this.codec, this.values)
    for (const [id, document] of this.entries()) result.set(id, this.values.clone(document))

    return result
  }
}
