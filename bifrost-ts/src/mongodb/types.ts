import type {
  ChangeStreamDocument,
  ChangeStreamOptions,
  ClientSession,
  Collection,
  CreateIndexesOptions,
  Db,
  Document,
  IndexSpecification,
  MongoClient,
  MongoClientOptions,
  ObjectId,
} from 'mongodb'
import type { z } from 'zod'

import type { EventOptions, Server } from '../server'

/** Runtime brand used by typed collection tokens to carry document types. */
export const MONGO_COLLECTION_DOCUMENT: unique symbol = Symbol(
  'bifrost.mongodb.collection.document',
)

/** Constructor accepted by MongoDB collection decorators. */
export type MongoCollectionClass = abstract new (
  ...args: never[]
) => unknown

/** Compile-time collection token that binds a decorated class to a document type. */
export interface MongoCollectionToken<TDocument extends Document> {
  /** Decorated class that owns runtime collection metadata. */
  readonly Class: MongoCollectionClass
  /** Phantom document type carried by the token for collection inference. */
  readonly [MONGO_COLLECTION_DOCUMENT]: TDocument
}

/** Binds a decorated collection class to a compile-time document type. */
export function typedMongoCollection<TDocument extends Document>(
  Class: MongoCollectionClass,
): MongoCollectionToken<TDocument> {
  return {
    Class,
    [MONGO_COLLECTION_DOCUMENT]: undefined as unknown as TDocument,
  }
}

/** Extracts the document type carried by a MongoDB collection token. */
export type MongoDocumentOf<TToken> =
  TToken extends MongoCollectionToken<infer TDocument> ? TDocument : never

/** Collection class or typed token accepted by runtime metadata readers. */
export type MongoCollectionTarget =
  | MongoCollectionClass
  | MongoCollectionToken<Document>

/** Index metadata declared through `@MongoIndex`. */
export interface MongoIndexDefinition {
  /** Native MongoDB index specification passed to `createIndexes`. */
  readonly spec: IndexSpecification
  /** Native MongoDB index options passed through unchanged. */
  readonly options?: CreateIndexesOptions
}

/** Channel selection returned by a MongoDB watch definition. */
export type MongoWatchChannel = string | readonly string[] | null | undefined

/** Function that maps a changed document into one or more Bifrost channels. */
export type MongoWatchChannelResolver<TDocument extends Document> = (
  document: TDocument,
  change: ChangeStreamDocument<TDocument>,
) => MongoWatchChannel | Promise<MongoWatchChannel>

/** Watch metadata declared through `@MongoWatch`. */
export interface MongoWatchDefinition<TDocument extends Document = Document> {
  /** Bifrost event name emitted for matching collection changes. */
  readonly event: string
  /** Bifrost event options used when registering the event on the server. */
  readonly eventOptions?: EventOptions
  /** Optional resolver for channel-scoped event emission. */
  readonly getChannel?: MongoWatchChannelResolver<TDocument>
  /** Fields that should not trigger event emission when they are the only updates. */
  readonly excludeFields?: readonly string[]
  /** Native change-stream pipeline passed to `collection.watch`. */
  readonly pipeline?: readonly Document[]
  /** Native `fullDocument` option; defaults to `updateLookup`. */
  readonly fullDocument?: ChangeStreamOptions['fullDocument']
  /** Native change-stream options passed through unchanged. */
  readonly options?: ChangeStreamOptions
}

/** Complete collection metadata accumulated by decorators. */
export interface MongoCollectionDefinition<
  TDocument extends Document = Document,
> {
  /** Decorated class that owns this metadata. */
  readonly Class: MongoCollectionClass
  /** MongoDB collection name. */
  readonly name: string
  /** Optional Zod schema used by explicit parse helpers. */
  readonly schema?: z.ZodType<TDocument>
  /** Indexes declared for explicit or opt-in startup creation. */
  readonly indexes: readonly MongoIndexDefinition[]
  /** Change-stream definitions declared for Bifrost event bridging. */
  readonly watches: readonly MongoWatchDefinition<TDocument>[]
}

/** Options accepted by `createBifrostMongo`. */
export interface BifrostMongoOptions {
  /** Optional Bifrost server used for change-stream event bridging. */
  readonly server?: Server
  /** MongoDB connection string used when no `client` or `db` is supplied. */
  readonly uri?: string
  /** External MongoDB client to reuse. */
  readonly client?: MongoClient
  /** External MongoDB database handle to reuse. */
  readonly db?: Db
  /** Database name used with `uri` or `client`. */
  readonly dbName?: string
  /** Native MongoDB client options used when connecting from `uri`. */
  readonly clientOptions?: MongoClientOptions
  /** Decorated collection classes or typed tokens to register. */
  readonly collections: readonly MongoCollectionTarget[]
  /** Whether to create declared indexes during startup. */
  readonly ensureIndexes?: boolean
  /** Whether `close()` should close an externally supplied client. */
  readonly closeExternalClient?: boolean
}

/** Runtime returned by `createBifrostMongo`. */
export interface BifrostMongo {
  /** Native database handle used by registered collections. */
  readonly db: Db
  /** Native client when one is known; `null` when constructed from an external `Db`. */
  readonly client: MongoClient | null
  /** Returns a native driver collection inferred from a typed collection token. */
  collection<TToken extends MongoCollectionToken<Document>>(
    token: TToken,
  ): Collection<MongoDocumentOf<TToken>>
  /** Returns a native driver collection by name when no typed token is available. */
  collectionByName<TDocument extends Document = Document>(
    name: string,
  ): Collection<TDocument>
  /** Returns decorator metadata for a registered collection. */
  meta(target: MongoCollectionTarget): MongoCollectionDefinition
  /** Creates all declared indexes without dropping or reconciling existing indexes. */
  ensureIndexes(): Promise<void>
  /** Closes change streams and the owned MongoDB client when applicable. */
  close(): Promise<void>
}

/** Payload emitted from MongoDB change streams through Bifrost events. */
export interface MongoWatchPayload<TDocument extends Document> {
  /** Driver resume token string for client-side deduplication. */
  readonly eventId: string
  /** Changed document identifier. */
  readonly _id: ObjectId
  /** Full document after the change, or `null` for deletes. */
  readonly doc: TDocument | null
  /** Whether the change represents a delete event. */
  readonly deleted: boolean
}

/** Options passed to pure helpers that forward native sessions. */
export interface MongoSessionOptions {
  /** Native MongoDB session to forward to driver calls. */
  readonly session?: ClientSession
}
