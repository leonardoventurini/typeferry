import type { ReactiveControllerHost } from 'lit'

import type { Client } from '../client'
import { ClientEvents } from '../utils'

import {
  type BifrostClientSource,
  BifrostClientBoundController,
} from './internal'

export class BifrostConnectionController extends BifrostClientBoundController {
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
    super(host, client)
    this.attach()
  }

  hostConnected(): void {
    this.bindClient()
    this.syncConnectionState()
  }

  hostUpdate(): void {
    this.bindClient()
    this.syncConnectionState()
  }

  protected afterClientChange(client: Client): void {
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
  }

  hostDisconnected(): void {
    super.hostDisconnected()
    this.isOffline = true
    this.isOnline = false
    this.isConnecting = false
    this.isReconnecting = false
  }
}
