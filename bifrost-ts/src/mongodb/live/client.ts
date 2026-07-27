import type { Client } from '../../client'
import { ClientEvents, NO_CHANNEL, Presentation } from '../../utils'
import { canonicalId } from './observer'
import {
  MONGO_LIVE_EVENT,
  MONGO_LIVE_RESYNC_METHOD,
  MONGO_LIVE_SUBSCRIBE_METHOD,
  MONGO_LIVE_UNSUBSCRIBE_METHOD,
  type MongoLiveArgsOf,
  type MongoLiveClientDocument,
  type MongoLiveDelta,
  type MongoLiveDocumentOf,
  type MongoLiveEvent,
  type MongoLivePublicationDescriptor,
  type MongoLiveSnapshot,
  type MongoLiveViewSnapshot,
} from './types'

const MONGO_LIVE_MAX_EARLY_DELTAS = 1_000

/** Options used to create one framework-independent MongoDB live view. */
export interface CreateMongoLiveViewOptions<
  TDescriptor extends MongoLivePublicationDescriptor<
    string,
    unknown,
    MongoLiveClientDocument
  >,
> {
  /** Connected Bifrost client that owns the WebSocket subscription. */
  readonly client: Client
  /** Typed named publication descriptor. */
  readonly publication: TDescriptor
  /** Arguments inferred from the publication descriptor. */
  readonly args: MongoLiveArgsOf<TDescriptor>
}

/** Framework-independent materialized MongoDB live query. */
export class MongoLiveView<
  TDescriptor extends MongoLivePublicationDescriptor<
    string,
    unknown,
    MongoLiveClientDocument
  >,
> {
  private readonly subscriptionId = Presentation.uuid()
  private readonly documents = new Map<
    string,
    MongoLiveDocumentOf<TDescriptor>
  >()
  private readonly listeners = new Set<() => void>()
  private readonly bufferedDeltas: MongoLiveDelta<
    MongoLiveDocumentOf<TDescriptor>
  >[] = []

  private generation: string | null = null
  private sequence = 0
  private stopped = false
  private startPromise: Promise<void> | null = null
  private resyncPromise: Promise<void> | null = null
  private connectionEpoch = 0
  private snapshot: MongoLiveViewSnapshot<MongoLiveDocumentOf<TDescriptor>> = {
    status: 'connecting',
    documents: [],
    error: null,
  }

  /** Creates an idle live handle; call `start()` to subscribe. */
  constructor(
    private readonly options: CreateMongoLiveViewOptions<TDescriptor>,
  ) {
    this.options.client.on(MONGO_LIVE_EVENT, this.handleEvent)
    this.options.client.on(ClientEvents.INITIALIZED, this.handleInitialized)
    this.options.client.on(ClientEvents.WEBSOCKET_CLOSED, this.handleClosed)
    this.options.client.on(ClientEvents.LOGOUT, this.handleClosed)
  }

  /** Returns the immutable state consumed by framework adapters. */
  readonly getSnapshot = (): MongoLiveViewSnapshot<
    MongoLiveDocumentOf<TDescriptor>
  > => this.snapshot

  /** Registers a state listener compatible with `useSyncExternalStore`. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Starts the WebSocket subscription once. */
  start(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    if (!this.startPromise) {
      const epoch = this.connectionEpoch
      const promise = this.subscribeRemote(epoch).finally(() => {
        if (this.startPromise === promise) this.startPromise = null
      })
      this.startPromise = promise
    }
    return this.startPromise
  }

  /** Replaces local state from an authoritative server snapshot. */
  resync(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    if (!this.generation) return this.start()
    if (!this.resyncPromise) {
      this.updateSnapshot('resyncing')
      const epoch = this.connectionEpoch
      const promise = this.options.client
        .call<unknown, MongoLiveSnapshot<MongoLiveDocumentOf<TDescriptor>>>(
          MONGO_LIVE_RESYNC_METHOD,
          {
            subscriptionId: this.subscriptionId,
            staleGeneration: this.generation,
          },
          liveCallOptions,
        )
        .then(snapshot => {
          if (epoch === this.connectionEpoch) this.applySnapshot(snapshot)
        })
        .catch(error => {
          if (epoch === this.connectionEpoch) this.fail(error)
        })
        .finally(() => {
          if (this.resyncPromise === promise) this.resyncPromise = null
        })
      this.resyncPromise = promise
    }
    return this.resyncPromise
  }

  /** Stops local delivery and releases the server subscription when connected. */
  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.options.client.off(MONGO_LIVE_EVENT, this.handleEvent)
    this.options.client.off(ClientEvents.INITIALIZED, this.handleInitialized)
    this.options.client.off(ClientEvents.WEBSOCKET_CLOSED, this.handleClosed)
    this.options.client.off(ClientEvents.LOGOUT, this.handleClosed)
    this.documents.clear()
    this.bufferedDeltas.length = 0
    this.updateSnapshot('stopped')

    if (this.options.client.clientSocket.ready) {
      await this.options.client
        .call(
          MONGO_LIVE_UNSUBSCRIBE_METHOD,
          { subscriptionId: this.subscriptionId },
          { ...liveCallOptions, ignoreInit: true },
        )
        .catch(() => undefined)
    }
  }

  private async subscribeRemote(epoch: number): Promise<void> {
    this.updateSnapshot('connecting')
    try {
      const snapshot = await this.options.client.call<
        unknown,
        MongoLiveSnapshot<MongoLiveDocumentOf<TDescriptor>>
      >(
        MONGO_LIVE_SUBSCRIBE_METHOD,
        {
          subscriptionId: this.subscriptionId,
          publication: this.options.publication.name,
          args: this.options.args,
        },
        liveCallOptions,
      )
      if (epoch === this.connectionEpoch) this.applySnapshot(snapshot)
    } catch (error) {
      if (epoch === this.connectionEpoch) this.fail(error)
    }
  }

  private applySnapshot(
    snapshot: MongoLiveSnapshot<MongoLiveDocumentOf<TDescriptor>>,
  ): void {
    if (this.stopped) return
    this.documents.clear()
    for (const document of snapshot.documents) {
      this.documents.set(canonicalId(document._id), document)
    }
    this.generation = snapshot.generation
    this.sequence = snapshot.sequence

    const buffered = this.bufferedDeltas.splice(0)
    for (const delta of buffered) {
      if (delta.generation !== this.generation) continue
      if (delta.sequence <= this.sequence) continue
      if (!this.applyDelta(delta)) {
        const activeResync = this.resyncPromise
        if (activeResync) {
          void activeResync.then(() => this.resync())
        } else {
          void this.resync()
        }
        return
      }
    }
    this.updateSnapshot('ready')
  }

  private readonly handleEvent = (event: MongoLiveEvent): void => {
    if (this.stopped || event.subscriptionId !== this.subscriptionId) return
    if (event.type === 'resync-required') {
      if (!this.generation || event.staleGeneration === this.generation) {
        void this.resync()
      }
      return
    }

    const delta = event as MongoLiveDelta<
      MongoLiveDocumentOf<TDescriptor>
    >
    if (this.snapshot.status !== 'ready' || !this.generation) {
      if (this.bufferedDeltas.length >= MONGO_LIVE_MAX_EARLY_DELTAS) {
        this.bufferedDeltas.length = 0
        if (this.generation) void this.resync()
        return
      }
      this.bufferedDeltas.push(delta)
      return
    }
    if (delta.generation !== this.generation) {
      void this.resync()
      return
    }
    if (delta.sequence <= this.sequence) return
    if (!this.applyDelta(delta)) void this.resync()
  }

  private applyDelta(
    delta: MongoLiveDelta<MongoLiveDocumentOf<TDescriptor>>,
  ): boolean {
    if (delta.sequence !== this.sequence + 1) return false
    for (const operation of delta.operations) {
      if (operation.type === 'removed') {
        this.documents.delete(canonicalId(operation.id))
      } else {
        this.documents.set(
          canonicalId(operation.document._id),
          operation.document,
        )
      }
    }
    this.sequence = delta.sequence
    this.updateSnapshot('ready')
    return true
  }

  private readonly handleInitialized = (): void => {
    if (!this.stopped) void this.start()
  }

  private readonly handleClosed = (): void => {
    if (!this.stopped) {
      this.connectionEpoch += 1
      this.startPromise = null
      this.resyncPromise = null
      this.generation = null
      this.sequence = 0
      this.bufferedDeltas.length = 0
      this.updateSnapshot('connecting')
    }
  }

  private fail(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error))
    this.snapshot = {
      status: 'error',
      documents: [...this.documents.values()],
      error: normalized,
    }
    this.notify()
  }

  private updateSnapshot(
    status: MongoLiveViewSnapshot<
      MongoLiveDocumentOf<TDescriptor>
    >['status'],
  ): void {
    this.snapshot = {
      status,
      documents: [...this.documents.values()],
      error: null,
    }
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

/** Creates one typed framework-independent MongoDB live view. */
export function createMongoLiveView<
  TDescriptor extends MongoLivePublicationDescriptor<
    string,
    unknown,
    MongoLiveClientDocument
  >,
>(options: CreateMongoLiveViewOptions<TDescriptor>): MongoLiveView<TDescriptor> {
  return new MongoLiveView(options)
}

const liveCallOptions = {
  http: false,
  httpFallback: false,
} as const
