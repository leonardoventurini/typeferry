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

/** MongoDB identifiers accepted by the server-side source. */
export type MongoLiveSourceId = ObjectId | string | number

/** Identifiers produced by Bifrost EJSON on the client wire. */
export type MongoLiveId = string | number

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
  /** Complete unordered result set. */
  readonly documents: readonly TDocument[]
}

/** Semantic document operation following a snapshot. */
export type MongoLiveOperation<
  TDocument extends MongoLiveClientDocument = MongoLiveClientDocument,
> =
  | { readonly type: 'added'; readonly document: TDocument }
  | { readonly type: 'changed'; readonly document: TDocument }
  | { readonly type: 'removed'; readonly id: MongoLiveId }

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
  /** Complete immutable unordered result set. */
  readonly documents: readonly TDocument[]
  /** Current failure, when status is `error`. */
  readonly error: Error | null
}
