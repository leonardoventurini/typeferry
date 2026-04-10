import type { ReactiveControllerHost } from 'lit'

import type { Client } from '../client'
import { ClientEvents } from '../utils'

import {
  type BifrostClientSource,
  BifrostReactiveController,
  requireClient,
} from './internal'
import {
  refreshAccessToken,
  setupTokenRefreshOnExpiry,
  type TokenRefreshConfig,
} from '../auth/client/token-refresh'
import { isTokenExpired } from '../client/context-manager'

export class BifrostTokenRefreshController extends BifrostReactiveController {
  private clientSource: BifrostClientSource
  private currentClient: Client | null = null
  private cleanupExpiry: (() => void) | null = null
  private config: Partial<TokenRefreshConfig>
  private beforeReconnectHandler: (() => Promise<void>) | null = null

  constructor(
    host: ReactiveControllerHost,
    client: BifrostClientSource,
    config: Partial<TokenRefreshConfig> = {},
  ) {
    super(host)
    this.clientSource = client
    this.config = config
    this.attach()
  }

  setConfig(config: Partial<TokenRefreshConfig>): void {
    this.config = config
    this.teardown()
    this.sync()
  }

  hostConnected(): void {
    this.sync()
  }

  hostUpdate(): void {
    this.sync()
  }

  hostDisconnected(): void {
    this.teardown()
    super.hostDisconnected()
    this.currentClient = null
  }

  private teardown(): void {
    if (this.cleanupExpiry) {
      this.cleanupExpiry()
      this.cleanupExpiry = null
    }

    if (
      this.currentClient?.visibilityManager.onBeforeReconnect ===
      this.beforeReconnectHandler
    ) {
      this.currentClient.visibilityManager.onBeforeReconnect = null
    }

    this.beforeReconnectHandler = null
  }

  private bindClient(client: Client): void {
    if (client === this.currentClient) return

    this.teardown()
    this.clearCleanups()

    this.currentClient = client

    this.listenThrottled(
      client,
      [
        ClientEvents.INITIALIZED,
        ClientEvents.LOGOUT,
        ClientEvents.CONTEXT_CHANGED,
      ],
      this.sync,
      16,
    )

    this.sync()
  }

  private sync = (): void => {
    const client = requireClient(this.clientSource)
    this.bindClient(client)

    if (!this.currentClient) return

    if (!this.currentClient.authenticated) {
      this.teardown()
      return
    }

    if (!this.cleanupExpiry) {
      this.cleanupExpiry = setupTokenRefreshOnExpiry(
        this.currentClient,
        this.config,
      )
    }

    if (!this.beforeReconnectHandler) {
      this.beforeReconnectHandler = async () => {
        if (isTokenExpired(this.currentClient!.context)) {
          await refreshAccessToken(this.currentClient!, this.config)
        }
      }
    }

    this.currentClient.visibilityManager.onBeforeReconnect =
      this.beforeReconnectHandler
  }
}
