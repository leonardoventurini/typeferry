import type { Client } from '../../client'
import type { CrossTabSyncConfig } from '../types'

const TOKEN_REFRESHED = 'TOKEN_REFRESHED'

/**
 * Set up cross-tab token synchronization using BroadcastChannel.
 * When one tab refreshes the token, all other tabs receive the update.
 *
 * @param client - Bifrost client instance
 * @param config - Sync configuration
 * @returns Cleanup function
 */
export function setupCrossTabSync(
  client: Client,
  config: CrossTabSyncConfig,
): () => void {
  // BroadcastChannel not available in SSR or older browsers
  if (typeof BroadcastChannel === 'undefined') {
    return () => {}
  }

  const channel = new BroadcastChannel(config.channelName)

  const handleMessage = (event: MessageEvent) => {
    // Validate message structure before trusting data from other tabs
    if (
      event.data?.type === TOKEN_REFRESHED &&
      typeof event.data.token === 'string' &&
      typeof event.data.exp === 'number'
    ) {
      const { token, exp, iat } = event.data

      const context: Record<string, unknown> = { token, exp }
      if (typeof iat === 'number') {
        context.iat = iat
        context._tokenReceivedAt = Date.now()
      }

      client.updateContext(context)

      if (config.tokenRefreshedEvent) {
        client.emit(config.tokenRefreshedEvent, { token, exp })
      }
    }
  }

  channel.addEventListener('message', handleMessage)

  return () => {
    channel.removeEventListener('message', handleMessage)
    channel.close()
  }
}

/**
 * Broadcast a token refresh to all other tabs.
 * Call this after successfully refreshing the token.
 *
 * @param channelName - BroadcastChannel name
 * @param token - New access token
 * @param exp - Token expiration (Unix timestamp in seconds)
 * @param iat - Token issued-at time (Unix timestamp in seconds) for clock-skew compensation
 */
export function broadcastTokenRefresh(
  channelName: string,
  token: string,
  exp: number,
  iat?: number,
): void {
  if (typeof BroadcastChannel === 'undefined') {
    return
  }

  const channel = new BroadcastChannel(channelName)
  channel.postMessage({ type: TOKEN_REFRESHED, token, exp, iat })
  channel.close()
}
