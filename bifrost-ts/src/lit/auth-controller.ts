import type { ReactiveControllerHost } from 'lit'

import type { Client } from '../client'
import { ClientEvents } from '../utils'

import {
  type BifrostClientSource,
  BifrostClientBoundController,
} from './internal'

export class BifrostAuthController extends BifrostClientBoundController {
  authenticated = false
  context: Record<string, unknown> = {}

  private readonly syncState = (): void => {
    if (!this.currentClient) return

    const nextAuthenticated = this.currentClient.authenticated
    const nextContext = this.cloneIfChanged(
      this.context,
      this.currentClient.context,
    )

    if (
      nextAuthenticated === this.authenticated &&
      nextContext === this.context
    ) {
      return
    }

    this.authenticated = nextAuthenticated
    this.context = nextContext
    this.requestUpdate()
  }

  constructor(host: ReactiveControllerHost, client: BifrostClientSource) {
    super(host, client)
    this.attach()
  }

  hostConnected(): void {
    this.bindClient()
    this.syncState()
  }

  hostUpdate(): void {
    this.bindClient()
    this.syncState()
  }

  protected afterClientChange(client: Client): void {
    this.listenThrottled(
      client,
      [
        ClientEvents.INITIALIZED,
        ClientEvents.LOGOUT,
        ClientEvents.CONTEXT_CHANGED,
      ],
      this.syncState,
      16,
    )
  }

  hostDisconnected(): void {
    super.hostDisconnected()
    this.authenticated = false
    this.context = {}
  }
}
