import type {
  Document,
  Filter,
  ObjectId,
} from 'mongodb'
import type { z } from 'zod'

import type { ClientNode } from '../../server'
import type { MongoCollectionToken } from '../types'

/** Reserved RPC used to create a connection-owned live subscription. */
export const MONGO_LIVE_SUBSCRIBE_METHOD = 'mongo:live:subscribe' as const

/** Reserved RPC used to replace a stale live subscription snapshot. */
export const MONGO_LIVE_RESYNC_METHOD = 'mongo:live:resync' as const

/** Reserved RPC used to stop a live subscription. */
export const MONGO_LIVE_UNSUBSCRIBE_METHOD = 'mongo:live:unsubscribe' as const

/** Reserved event carrying live deltas and resynchronization controls. */
export const MONGO_LIVE_EVENT = 'mongo:live:delta' as const

/** Client capability required before an ordered splice can be delivered. */
export const MONGO_LIVE_ORDERED_WINDOW_CAPABILITY =
  'ordered-window-splice-v1' as const

/** Client capability for collision-proof ObjectId materialization. */
export const MONGO_LIVE_TYPED_OBJECT_ID_CAPABILITY =
  'typed-object-id-v1' as const

/** Default maximum live subscriptions owned by one WebSocket connection. */
export const MONGO_LIVE_MAX_SUBSCRIPTIONS_PER_CONNECTION = 32

/** Default maximum documents accepted in one initial snapshot. */
export const MONGO_LIVE_MAX_SNAPSHOT_DOCUMENTS = 10_000

/** Default native WebSocket queue size before a subscription becomes stale. */
export const MONGO_LIVE_MAX_BUFFERED_BYTES = 2 * 1024 * 1024

/** Time allowed for a slow consumer to recover before its socket is closed. */
export const MONGO_LIVE_SLOW_CONSUMER_GRACE_MS = 30_000

/** Delay between change-stream reconnect attempts. */
export const MONGO_LIVE_SOURCE_RETRY_MS = 250

/** Default maximum number of documents skipped by an ordered window. */
export const MONGO_LIVE_MAX_WINDOW_SKIP = 100_000

/** MongoDB identifiers accepted by the server-side source. */
export type MongoLiveSourceId = ObjectId | string | number

/** Collision-proof ObjectId representation produced on the client wire. */
export interface MongoLiveObjectId {
  /** Canonical MongoDB ObjectId hexadecimal value. */
  readonly $objectId: string
}

/** Identifiers produced by Bifrost EJSON on the client wire. */
export type MongoLiveId = MongoLiveObjectId | string | number

/** Removes source identity from fields returned by a publication projector. */
export type MongoLiveProjectedFields<TFields extends object = object> =
  Readonly<Omit<TFields, '_id'>> & { readonly _id?: never }

/** Client-visible live document with a source-owned stable identity. */
export type MongoLiveClientDocument<
  TFields extends object = object,
> = Readonly<{ _id: MongoLiveId } & Omit<TFields, '_id'>>

declare const MONGO_LIVE_ARGS: unique symbol
declare const MONGO_LIVE_DOCUMENT: unique symbol

/** Serializable client contract for one named live publication. */
export interface MongoLivePublicationDescriptor<
  TName extends string,
  TArgs,
  TDocument extends { readonly _id: MongoLiveId },
> {
  /** Server-registered publication name. */
  readonly name: TName
  /** Phantom argument type used by client inference. */
  readonly [MONGO_LIVE_ARGS]?: TArgs
  /** Phantom result type used by client inference. */
  readonly [MONGO_LIVE_DOCUMENT]?: TDocument
}

/** Extracts the argument type carried by a publication descriptor. */
export type MongoLiveArgsOf<TDescriptor> =
  TDescriptor extends MongoLivePublicationDescriptor<string, infer TArgs, { readonly _id: MongoLiveId }>
    ? TArgs
    : never

/** Extracts the client document type carried by a publication descriptor. */
export type MongoLiveDocumentOf<TDescriptor> =
  TDescriptor extends MongoLivePublicationDescriptor<string, unknown, infer TDocument>
    ? TDocument
    : never

/** Creates a client-safe publication descriptor factory with inferred name. */
export function mongoLivePublication<
  TArgs,
  TDocument extends { readonly _id: MongoLiveId },
>(): <const TName extends string>(
  name: TName,
) => MongoLivePublicationDescriptor<TName, TArgs, TDocument> {
  return <const TName extends string>(
    name: TName,
  ): MongoLivePublicationDescriptor<TName, TArgs, TDocument> => ({ name })
}

/** Connection context available only while authorizing a subscription. */
export interface MongoLiveAuthorizationContext {
  /** Calling Bifrost WebSocket node. */
  readonly client: ClientNode
  /** Aborts when authorization or the owning connection is cancelled. */
  readonly signal: AbortSignal
}

/** Typed server implementation of a live publication. */
export interface MongoLivePublicationConfig<
  TArgs,
  TScope,
  TStoredDocument extends Document,
  TFields extends object,
> {
  /** Decorated collection token queried by the publication. */
  readonly collection: MongoCollectionToken<TStoredDocument>
  /** Runtime argument validator. */
  readonly args: z.ZodType<TArgs>
  /** Authentication is required unless explicitly disabled. */
  readonly protected?: boolean
  /** Authorizes the caller and returns detached immutable query scope. */
  readonly authorize: (
    context: MongoLiveAuthorizationContext,
    args: TArgs,
  ) => TScope | Promise<TScope>
  /** Builds the authoritative MongoDB selector. */
  readonly filter: (scope: TScope, args: TArgs) => Filter<TStoredDocument>
  /**
   * Builds one bounded ordered window. Omit for unordered set semantics.
   *
   * The runtime appends `_id`; application code must not declare it.
   */
  readonly window?: (
    scope: NoInfer<TScope>,
    args: NoInfer<TArgs>,
  ) => MongoLiveWindow<TStoredDocument>
  /** Projects stored data into client-visible fields without `_id`. */
  readonly project: (
    document: TStoredDocument,
    scope: TScope,
  ) => MongoLiveProjectedFields<TFields> | Promise<MongoLiveProjectedFields<TFields>>
}

/** Runtime-erased publication consumed by the live engine. */
export interface MongoLiveRuntimePublication {
  /** Public publication name. */
  readonly name: string
  /** Decorated collection token. */
  readonly collection: MongoCollectionToken<Document>
  /** Whether the caller must be authenticated. */
  readonly protected: boolean
  /** Parses untrusted RPC arguments. */
  parseArgs(value: unknown): unknown
  /** Authorizes a caller and returns detached query scope. */
  authorize(
    context: MongoLiveAuthorizationContext,
    args: unknown,
  ): Promise<unknown>
  /** Builds the MongoDB selector from validated state. */
  filter(scope: unknown, args: unknown): Filter<Document>
  /** Builds the optional server-owned ordered window. */
  window?(scope: unknown, args: unknown): MongoLiveWindowInput | null
  /** Projects one stored document and injects no identity. */
  project(
    document: Document,
    scope: unknown,
  ): Promise<MongoLiveProjectedFields<object>>
}

/** Server registration retaining its typed client descriptor. */
export interface MongoLivePublicationDefinition<
  TDescriptor extends MongoLivePublicationDescriptor<string, unknown, MongoLiveClientDocument>,
> extends MongoLiveRuntimePublication {
  /** Client-safe descriptor corresponding to the server implementation. */
  readonly descriptor: TDescriptor
}

/** Untrusted request to start a live subscription. */
export interface MongoLiveSubscribeRequest {
  /** Stable client-generated subscription identifier. */
  readonly subscriptionId: string
  /** Registered publication name. */
  readonly publication: string
  /** Publication-specific arguments validated by the server. */
  readonly args: unknown
  /** Optional wire extensions understood by the subscribing client. */
  readonly capabilities?: readonly string[]
}

/** Request to replace a stale subscription generation. */
export interface MongoLiveResyncRequest {
  /** Existing connection-owned subscription identifier. */
  readonly subscriptionId: string
  /** Generation observed by the requesting client. */
  readonly staleGeneration: string
}

/** Request to stop a connection-owned subscription. */
export interface MongoLiveUnsubscribeRequest {
  /** Existing connection-owned subscription identifier. */
  readonly subscriptionId: string
}

/** Complete authoritative state returned by subscribe and resync RPCs. */
export interface MongoLiveSnapshot<
  TDocument extends MongoLiveClientDocument = MongoLiveClientDocument,
> {
  /** Stable connection-owned subscription identifier. */
  readonly subscriptionId: string
  /** Incarnation identifier replaced by every resnapshot. */
  readonly generation: string
  /** Last sequence represented by the snapshot. */
  readonly sequence: number
  /** Whether document order is part of the authoritative contract. */
  readonly ordered?: boolean
  /** Complete authoritative result set or ordered window. */
  readonly documents: readonly TDocument[]
}

/** Direction accepted for one ordered publication sort field. */
export type MongoLiveSortDirection = 1 | -1

/** Top-level stored-document field accepted by an ordered publication. */
type MongoLiveDeclaredDocumentKeys<TDocument extends Document> = keyof {
  [TKey in keyof TDocument as string extends TKey
    ? never
    : number extends TKey
      ? never
      : TKey]: TDocument[TKey]
}

/** Top-level stored-document field accepted by an ordered publication. */
export type MongoLiveSortField<TDocument extends Document> = Exclude<
  Extract<MongoLiveDeclaredDocumentKeys<TDocument>, string>,
  '_id'
>

/** Stable application sort owned by an ordered publication. */
export type MongoLiveSort<TDocument extends Document> = Readonly<
  Partial<Record<MongoLiveSortField<TDocument>, MongoLiveSortDirection>>
> & { readonly _id?: never }

/** Stable, bounded server-owned ordered MongoDB query window. */
export interface MongoLiveWindow<TDocument extends Document = Document> {
  /** Non-empty top-level sort fields; the runtime appends `_id: 1`. */
  readonly sort: MongoLiveSort<TDocument>
  /** Number of matching documents omitted before the visible window. */
  readonly skip?: number
  /** Maximum number of visible documents. */
  readonly limit: number
}

/** Runtime-erased ordered-window input awaiting capacity validation. */
export interface MongoLiveWindowInput {
  /** Application fields before the runtime identity tie-breaker. */
  readonly sort: Readonly<Record<string, MongoLiveSortDirection>>
  /** Requested offset. */
  readonly skip?: number
  /** Requested visible bound. */
  readonly limit: number
}

/** Runtime-erased and validated ordered window. */
export interface MongoLiveRuntimeWindow {
  /** Unique application fields followed by the runtime `_id` tie-breaker. */
  readonly sort: readonly (readonly [string, MongoLiveSortDirection])[]
  /** Validated non-negative offset. */
  readonly skip: number
  /** Validated positive bound. */
  readonly limit: number
}

/** Atomic ordered-window replacement operation. */
export interface MongoLiveWindowSpliceOperation<
  TDocument extends MongoLiveClientDocument = MongoLiveClientDocument,
> {
  /** Positional operation discriminator. */
  readonly type: 'window-splice'
  /** Zero-based index in the current ordered array. */
  readonly index: number
  /** Number of current documents removed at `index`. */
  readonly deleteCount: number
  /** Authoritative replacement documents inserted at `index`. */
  readonly documents: readonly TDocument[]
}

/** Semantic document operation following a snapshot. */
export type MongoLiveOperation<
  TDocument extends MongoLiveClientDocument = MongoLiveClientDocument,
> =
  | { readonly type: 'added'; readonly document: TDocument }
  | { readonly type: 'changed'; readonly document: TDocument }
  | { readonly type: 'removed'; readonly id: MongoLiveId }
  | MongoLiveWindowSpliceOperation<TDocument>

/** Ordered operation batch for one subscription generation. */
export interface MongoLiveDelta<
  TDocument extends MongoLiveClientDocument = MongoLiveClientDocument,
> {
  /** Discriminator for data messages. */
  readonly type: 'delta'
  /** Target subscription. */
  readonly subscriptionId: string
  /** Target generation. */
  readonly generation: string
  /** Monotonically increasing connection-local sequence. */
  readonly sequence: number
  /** Semantic operations applied atomically by the client. */
  readonly operations: readonly MongoLiveOperation<TDocument>[]
}

/** Control message requiring a complete authoritative replacement. */
export interface MongoLiveResyncRequired {
  /** Discriminator for control messages. */
  readonly type: 'resync-required'
  /** Target subscription. */
  readonly subscriptionId: string
  /** Generation that must no longer be treated as ready. */
  readonly staleGeneration: string
}

/** Payload carried by the reserved live event. */
export type MongoLiveEvent<
  TDocument extends MongoLiveClientDocument = MongoLiveClientDocument,
> = MongoLiveDelta<TDocument> | MongoLiveResyncRequired

/** Runtime capacity and slow-consumer controls. */
export interface MongoLiveOptions {
  /** Named server publications exposed by this registry. */
  readonly publications: readonly MongoLiveRuntimePublication[]
  /** Maximum subscriptions owned by one connection. */
  readonly maxSubscriptionsPerConnection?: number
  /** Maximum documents accepted in one snapshot. */
  readonly maxSnapshotDocuments?: number
  /** Maximum `skip` accepted from a server-owned ordered publication. */
  readonly maxWindowSkip?: number
  /** Native WebSocket queue threshold before resync is required. */
  readonly maxBufferedBytes?: number
  /** Slow-consumer recovery grace period. */
  readonly slowConsumerGraceMs?: number
}

/** Public client state for one live view. */
export interface MongoLiveViewSnapshot<
  TDocument extends MongoLiveClientDocument,
> {
  /** Current lifecycle state. */
  readonly status:
    | 'connecting'
    | 'ready'
    | 'resyncing'
    | 'stopped'
    | 'error'
  /** Complete immutable result set in authoritative order when configured. */
  readonly documents: readonly TDocument[]
  /** Current failure, when status is `error`. */
  readonly error: Error | null
}
