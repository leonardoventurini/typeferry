import { useCallback, useEffect, useState } from 'react'

import { ClientEvents } from '../../utils'
import { useClient } from './use-client'
import { useObject } from './use-object'
import { useThrottledEvents } from './use-throttled-events'

/**
 * Returns React state synchronized with the active Bifrost authentication state.
 */
export function useAuth() {
  const client = useClient()
  const [authenticated, setAuthenticated] = useState(() => client.authenticated)
  const [context, setContext] = useState(() => client.context)

  const updateState = useCallback(() => {
    setAuthenticated(client.authenticated)
    setContext(client.context)
  }, [client])

  useThrottledEvents(
    client,
    [
      ClientEvents.INITIALIZED,
      ClientEvents.LOGOUT,
      ClientEvents.CONTEXT_CHANGED,
    ],
    updateState,
    [updateState],
    16,
  )

  /**
   * Reconcile after the passive subscription is installed so an auth event
   * delivered between render and effect cannot be lost.
   */
  useEffect(() => {
    updateState()
  }, [updateState])

  return useObject({
    client,
    authenticated,
    context,
  })
}
