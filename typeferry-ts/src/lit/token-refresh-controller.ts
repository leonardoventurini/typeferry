import type { ReactiveControllerHost } from 'lit'

import type { Client } from '../client'
import { ClientEvents } from '../utils'

import {
  type TypeFerryClientSource,
  TypeFerryClientBoundController,
} from './internal'
import {
  refreshAccessToken,
  setupTokenRefreshOnExpiry,
  type TokenRefreshConfig,
} from '../auth/client/token-refresh'
import { isTokenExpired } from '../client/context-manager'

export class TypeFerryTokenRefreshController extends TypeFerryClientBoundController {
  private cleanupExpiry: (() => void) | null = null
  private config: Partial<TokenRefreshConfig>
  private beforeReconnectHandler: (() => Promise<void>) | null = null

  constructor(
    host: ReactiveControllerHost,
    client: TypeFerryClientSource,
    config: Partial<TokenRefreshConfig> = {},
  ) {
    super(host, client)
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

  protected beforeClientChange(previousClient: Client | null): void {
    this.currentClient = previousClient
    this.teardown()
  }

  protected afterClientChange(client: Client): void {
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
  }

  private sync = (): void => {
    const client = this.bindClient()

    if (!client.authenticated) {
      this.teardown()
      return
    }

    if (!this.cleanupExpiry) {
      this.cleanupExpiry = setupTokenRefreshOnExpiry(client, this.config)
    }

    if (!this.beforeReconnectHandler) {
      this.beforeReconnectHandler = async () => {
        if (isTokenExpired(client.context)) {
          await refreshAccessToken(client, this.config)
        }
      }
    }

    client.visibilityManager.onBeforeReconnect = this.beforeReconnectHandler
  }
}
