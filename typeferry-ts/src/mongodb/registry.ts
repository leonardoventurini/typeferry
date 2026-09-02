import {
  MongoServerError,
  type Collection,
  type Db,
  type Document,
  type MongoClient,
} from 'mongodb'

import { startMongoWatch, type MongoWatchHandle } from './change-streams'
import { resolveMongoConnection } from './client'
import { getMongoCollectionDefinition } from './decorators'
import { MongoLiveEngine } from './live/engine'
import type {
  TypeFerryMongo,
  TypeFerryMongoOptions,
  MongoCollectionClass,
  MongoCollectionDefinition,
  MongoCollectionTarget,
  MongoCollectionToken,
  MongoDocumentOf,
} from './types'
import { mongoValidator } from './validator'

const NAMESPACE_EXISTS_ERROR_CODE = 48

/** Extracts a decorated collection class from a raw class or typed token. */
export function mongoCollectionClass(
  target: MongoCollectionTarget,
): MongoCollectionClass {
  return 'Class' in target ? target.Class : target
}

/** Runtime registry for decorated MongoDB collections and native driver handles. */
export class TypeFerryMongoRegistry implements TypeFerryMongo {
  /** Native database handle used by registered collections. */
  readonly db: Db
  /** Native client when one is known; `null` when constructed from an external `Db`. */
  readonly client: MongoClient | null

  private readonly closeClient: boolean
  private readonly definitions = new Map<
    MongoCollectionClass,
    MongoCollectionDefinition
  >()
  private readonly collections = new Map<string, Collection<Document>>()
  private readonly watchHandles: MongoWatchHandle[] = []
  private readonly liveEngine: MongoLiveEngine | null

  /** Creates a registry from resolved MongoDB handles. */
  constructor(
    options: TypeFerryMongoOptions,
    connection: { readonly db: Db; readonly client: MongoClient | null; readonly ownsClient: boolean },
  ) {
    this.db = connection.db
    this.client = connection.client
    this.closeClient = connection.ownsClient || Boolean(options.closeExternalClient)

    for (const target of options.collections) {
      const Class = mongoCollectionClass(target)
      const definition = getMongoCollectionDefinition(Class)
      this.definitions.set(Class, definition)
      this.collections.set(definition.name, this.db.collection(definition.name))
    }

    if (options.live && !options.server) {
      throw new Error('MongoDB live publications require a TypeFerry server.')
    }

    if (options.live) {
      for (const publication of options.live.publications) {
        this.meta(publication.collection)
      }
    }

    this.liveEngine =
      options.server && options.live
        ? new MongoLiveEngine({
            server: options.server,
            options: options.live,
            resolveCollection: publication =>
              this.collection(publication.collection),
            collectionName: publication =>
              this.meta(publication.collection).name,
          })
        : null

    if (options.server) {
      this.startWatches(options)
    }
  }

  /** Returns a native driver collection inferred from a typed collection token. */
  collection<TToken extends MongoCollectionToken<Document>>(
    token: TToken,
  ): Collection<MongoDocumentOf<TToken>> {
    const definition = this.meta(token)
    return this.collectionByName<MongoDocumentOf<TToken>>(definition.name)
  }

  /** Returns a native driver collection by name when no typed token is available. */
  collectionByName<TDocument extends Document = Document>(
    name: string,
  ): Collection<TDocument> {
    const registered = this.collections.get(name)
    if (registered) return registered as unknown as Collection<TDocument>
    return this.db.collection<TDocument>(name)
  }

  /** Returns decorator metadata for a registered collection. */
  meta(target: MongoCollectionTarget): MongoCollectionDefinition {
    const Class = mongoCollectionClass(target)
    const definition = this.definitions.get(Class)
    if (!definition) {
      throw new Error(`MongoDB collection "${Class.name}" is not registered.`)
    }
    return definition
  }

  /** Creates all declared indexes without dropping or reconciling existing indexes. */
  async ensureIndexes(): Promise<void> {
    for (const definition of this.definitions.values()) {
      const collection = this.collectionByName(definition.name)
      for (const index of definition.indexes) {
        await collection.createIndex(index.spec, index.options)
      }
    }
  }

  /** Creates missing collections and updates existing strict schema validators. */
  async ensureSchemas(): Promise<void> {
    for (const definition of this.definitions.values()) {
      if (!definition.schema) {
        throw new Error(
          `MongoDB collection "${definition.name}" is missing @MongoSchema metadata.`,
        )
      }

      const options = {
        validator: mongoValidator(definition.schema),
        validationLevel: 'strict' as const,
        validationAction: 'error' as const,
      }
      const exists = await this.db
        .listCollections({ name: definition.name }, { nameOnly: true })
        .hasNext()

      if (exists) {
        await this.db.command({ collMod: definition.name, ...options })
        continue
      }

      try {
        await this.db.createCollection(definition.name, options)
      } catch (error) {
        if (
          !(error instanceof MongoServerError) ||
          error.code !== NAMESPACE_EXISTS_ERROR_CODE
        ) {
          throw error
        }

        await this.db.command({ collMod: definition.name, ...options })
      }
    }
  }

  /** Closes change streams and the owned MongoDB client when applicable. */
  async close(): Promise<void> {
    await this.liveEngine?.close()
    await Promise.all(this.watchHandles.map(handle => handle.close()))
    this.watchHandles.length = 0
    if (this.closeClient) {
      await this.client?.close()
    }
  }

  private startWatches(options: TypeFerryMongoOptions): void {
    const server = options.server
    if (!server) return

    for (const definition of this.definitions.values()) {
      const collection = this.collectionByName(definition.name)
      for (const watch of definition.watches) {
        this.watchHandles.push(
          startMongoWatch({
            collection,
            definition,
            watch,
            server,
          }),
        )
      }
    }
  }
}

/** Creates a TypeFerry MongoDB registry around native MongoDB driver handles. */
export async function createTypeFerryMongo(
  options: TypeFerryMongoOptions,
): Promise<TypeFerryMongo> {
  const connection = await resolveMongoConnection(options)
  let registry: TypeFerryMongoRegistry | null = null
  try {
    registry = new TypeFerryMongoRegistry(options, connection)
    if (options.ensureSchemas) {
      await registry.ensureSchemas()
    }
    if (options.ensureIndexes) {
      await registry.ensureIndexes()
    }
    return registry
  } catch (error) {
    if (registry) {
      await registry.close()
    } else if (connection.ownsClient) {
      await connection.client?.close()
    }
    throw error
  }
}
