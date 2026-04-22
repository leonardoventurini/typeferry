import type {
  ChangeStream,
  ChangeStreamDeleteDocument,
  ChangeStreamDocument,
  ChangeStreamInsertDocument,
  ChangeStreamReplaceDocument,
  ChangeStreamUpdateDocument,
  Collection,
  Document,
  ObjectId,
} from 'mongodb'

import type { Server } from '../server'

import type {
  MongoCollectionDefinition,
  MongoWatchDefinition,
  MongoWatchPayload,
} from './types'

const DEFAULT_RECONNECT_DELAY_MS = 250

/** Handle returned by a running MongoDB watcher. */
export interface MongoWatchHandle {
  /** Stops the watcher and closes the active change stream. */
  close(): Promise<void>
}

/** Options required to start a MongoDB watch bridge. */
export interface StartMongoWatchOptions<TDocument extends Document> {
  /** Native collection to watch. */
  readonly collection: Collection<TDocument>
  /** Collection metadata that owns the watch definition. */
  readonly definition: MongoCollectionDefinition<TDocument>
  /** Watch definition to start. */
  readonly watch: MongoWatchDefinition<TDocument>
  /** Bifrost server used for event registration and emission. */
  readonly server: Server
  /** Delay before reconnecting after a transient stream failure. */
  readonly reconnectDelayMs?: number
}

/** Starts a native MongoDB change stream and emits matching changes through Bifrost. */
export function startMongoWatch<TDocument extends Document>(
  options: StartMongoWatchOptions<TDocument>,
): MongoWatchHandle {
  options.server.addEvent(options.watch.event, options.watch.eventOptions)

  let closed = false
  let activeStream: ChangeStream<TDocument> | null = null

  const run = async (): Promise<void> => {
    while (!closed) {
      const streamOptions = {
        fullDocument: options.watch.fullDocument ?? 'updateLookup',
        ...options.watch.options,
      }
      const pipeline = options.watch.pipeline
        ? [...options.watch.pipeline]
        : undefined
      activeStream = options.collection.watch<TDocument>(
        pipeline,
        streamOptions,
      )

      try {
        for await (const change of activeStream) {
          if (closed) break
          await emitChange(options, change)
        }
      } catch (error) {
        if (closed) break
        await delay(options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS)
      } finally {
        await activeStream.close().catch(() => undefined)
        activeStream = null
      }
    }
  }

  void run()

  return {
    async close(): Promise<void> {
      closed = true
      await activeStream?.close().catch(() => undefined)
    },
  }
}

/** Converts a change stream document into the public Bifrost watch payload. */
export function toMongoWatchPayload<TDocument extends Document>(
  change: ChangeStreamDocument<TDocument>,
): MongoWatchPayload<TDocument> | null {
  const _id = extractObjectId(change)
  if (!_id) return null

  if (change.operationType === 'delete') {
    return {
      eventId: stringifyResumeToken(change._id),
      _id,
      doc: null,
      deleted: true,
    }
  }

  const doc = readFullDocument(change)
  if (!doc) return null

  return {
    eventId: stringifyResumeToken(change._id),
    _id,
    doc,
    deleted: false,
  }
}

/** Returns whether an update should be suppressed by watch filtering rules. */
export function shouldSkipMongoWatchChange<TDocument extends Document>(
  change: ChangeStreamDocument<TDocument>,
  watch: MongoWatchDefinition<TDocument>,
): boolean {
  if (change.operationType !== 'update') return false

  const fields = changedFieldNames(change)
  if (fields.length === 0) return false

  return fields.every(field => {
    const root = field.split('.')[0]
    return root === 'updatedAt' || Boolean(watch.excludeFields?.includes(root))
  })
}

async function emitChange<TDocument extends Document>(
  options: StartMongoWatchOptions<TDocument>,
  change: ChangeStreamDocument<TDocument>,
): Promise<void> {
  if (shouldSkipMongoWatchChange(change, options.watch)) return

  const payload = toMongoWatchPayload(change)
  if (!payload) return

  const channels = await resolveChannels(options.watch, change, payload.doc)
  for (const channel of channels) {
    options.server.channel(channel).emit(options.watch.event, payload)
  }
}

async function resolveChannels<TDocument extends Document>(
  watch: MongoWatchDefinition<TDocument>,
  change: ChangeStreamDocument<TDocument>,
  document: TDocument | null,
): Promise<string[]> {
  if (!watch.getChannel || !document) return ['']
  const result = await watch.getChannel(document, change)
  if (!result) return []
  if (typeof result === 'string') return [result]
  return [...result]
}

function readFullDocument<TDocument extends Document>(
  change: ChangeStreamDocument<TDocument>,
): TDocument | null {
  if (
    change.operationType === 'insert' ||
    change.operationType === 'replace' ||
    change.operationType === 'update'
  ) {
    return change.fullDocument ?? null
  }
  return null
}

function extractObjectId<TDocument extends Document>(
  change: ChangeStreamDocument<TDocument>,
): ObjectId | null {
  if (!('documentKey' in change)) return null
  const key = change.documentKey as { _id?: unknown }
  if (isObjectId(key._id)) return key._id
  return null
}

function changedFieldNames<TDocument extends Document>(
  change: ChangeStreamUpdateDocument<TDocument>,
): string[] {
  return [
    ...Object.keys(change.updateDescription.updatedFields ?? {}),
    ...(change.updateDescription.removedFields ?? []),
  ]
}

function stringifyResumeToken(token: Document): string {
  return JSON.stringify(token)
}

function isObjectId(value: unknown): value is ObjectId {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    value.constructor.name === 'ObjectId' &&
    typeof (value as { toHexString?: unknown }).toHexString === 'function'
  )
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

/** Type alias covering changes that include a full document. */
export type MongoFullDocumentChange<TDocument extends Document> =
  | ChangeStreamInsertDocument<TDocument>
  | ChangeStreamReplaceDocument<TDocument>
  | ChangeStreamUpdateDocument<TDocument>

/** Type alias covering delete changes handled by the bridge. */
export type MongoDeleteChange<TDocument extends Document> =
  ChangeStreamDeleteDocument<TDocument>
