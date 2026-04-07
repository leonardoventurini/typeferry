import { useEffect, useRef } from 'react'

import {
  refreshAccessToken,
  setupTokenRefreshOnExpiry,
  type TokenRefreshConfig,
} from '../../auth/client/token-refresh'
import { isTokenExpired } from '../../client/context-manager'
import { useAuth } from './use-auth'
import { useClient } from './use-client'

/**
 * Hook to set up automatic token refresh when authenticated.
 * Automatically cleans up when the component unmounts or auth state changes.
 *
 * Also registers a pre-reconnect hook on the visibility manager so that
 * expired access tokens are refreshed via HTTP *before* the socket reconnects
 * after a tab restore — preventing a failed-auth flash that forces the user
 * to see the login screen momentarily.
 *
 * @param config - Optional configuration for refresh behavior
 */
export function useTokenRefresh(config?: Partial<TokenRefreshConfig>): void {
  const client = useClient()
  const { authenticated } = useAuth()

  const configRef = useRef(config)

  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(() => {
    if (!authenticated) {
      return
    }

    const cleanupExpiry = setupTokenRefreshOnExpiry(client, configRef.current)

    client.visibilityManager.onBeforeReconnect = async () => {
      if (isTokenExpired(client.context)) {
        await refreshAccessToken(client, configRef.current)
      }
    }

    return () => {
      cleanupExpiry()
      client.visibilityManager.onBeforeReconnect = null
    }
  }, [authenticated, client])
}
