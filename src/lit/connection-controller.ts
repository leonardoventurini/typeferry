import type { ReactiveControllerHost } from 'lit'

import type { Client } from '../client'
import { ClientEvents } from '../utils'

import {
  type BifrostClientSource,
  BifrostReactiveController,
  requireClient,
} from './internal'

export class BifrostConnectionController extends BifrostReactiveController {
  private clientSource: BifrostClientSource
  private currentClient: Client | null = null

  isOffline = true
  isOnline = false
  isConnecting = false
  isReconnecting = false

  private readonly syncConnectionState = (): void => {
    if (!this.currentClient) return

    const nextOffline = this.currentClient.isOffline
    const nextOnline = this.currentClient.isOnline
    const nextConnecting = this.currentClient.isConnecting

    if (
      nextOffline === this.isOffline &&
      nextOnline === this.isOnline &&
      nextConnecting === this.isConnecting
    ) {
      return
    }

    this.isOffline = nextOffline
    this.isOnline = nextOnline
    this.isConnecting = nextConnecting
    this.requestUpdate()
  }

  private readonly markReconnecting = (): void => {
    if (this.isReconnecting) return
    this.isReconnecting = true
    this.requestUpdate()
  }

  private readonly markReconnected = (): void => {
    if (!this.isReconnecting) return
    this.isReconnecting = false
    this.requestUpdate()
  }

  constructor(host: ReactiveControllerHost, client: BifrostClientSource) {
    super(host)
    this.clientSource = client
    this.attach()
  }

  get client(): Client | null {
    return this.currentClient
  }

  hostConnected(): void {
    this.bindClient()
  }

  hostUpdate(): void {
    this.bindClient()
  }

  private bindClient(): void {
    const client = requireClient(this.clientSource)

    if (client === this.currentClient) {
      this.syncConnectionState()
      return
    }

    this.currentClient = client
    this.clearCleanups()

    this.listenThrottled(
      client,
      [
        ClientEvents.INITIALIZED,
        ClientEvents.WEBSOCKET_CLOSED,
        ClientEvents.CONNECTING,
      ],
      this.syncConnectionState,
      16,
    )

    this.listen(client, ClientEvents.WEBSOCKET_RECONNECTING, this.markReconnecting)
    this.listen(client, ClientEvents.INITIALIZED, this.markReconnected)

    this.syncConnectionState()
    this.markReconnected()
  }

  hostDisconnected(): void {
    super.hostDisconnected()
    this.currentClient = null
    this.isOffline = true
    this.isOnline = false
    this.isConnecting = false
    this.isReconnecting = false
  }
}
