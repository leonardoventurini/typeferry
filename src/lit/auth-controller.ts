import type { ReactiveControllerHost } from 'lit'

import type { Client } from '../client'
import { ClientEvents } from '../utils'

import {
  type BifrostClientSource,
  BifrostReactiveController,
  requireClient,
} from './internal'

export class BifrostAuthController extends BifrostReactiveController {
  private clientSource: BifrostClientSource
  private currentClient: Client | null = null

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
      this.syncState()
      return
    }

    this.currentClient = client
    this.clearCleanups()

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

    this.syncState()
  }

  hostDisconnected(): void {
    super.hostDisconnected()
    this.currentClient = null
    this.authenticated = false
    this.context = {}
  }
}
