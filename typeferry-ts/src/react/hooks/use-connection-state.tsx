import { useCallback, useEffect, useState } from 'react'

import { ClientEvents } from '../../utils'
import { useClient } from './use-client'
import { useThrottledEvents } from './use-throttled-events'

/**
 * React hook for tracking TypeFerry client connection state.
 *
 * Uses event-driven updates via `useThrottledEvents` rather than polling.
 * This prevents performance violations when tabs wake from sleep, where
 * accumulated setInterval callbacks would fire all at once.
 */
export function useConnectionState() {
  const client = useClient()

  const [isOffline, setOffline] = useState(true)
  const [isOnline, setOnline] = useState(false)
  const [isConnecting, setConnecting] = useState(false)
  const [isReconnecting, setReconnecting] = useState(false)

  const updateConnectionState = useCallback(() => {
    setOffline(client.isOffline)
    setOnline(client.isOnline)
    setConnecting(client.isConnecting)
  }, [client])

  // Update state on connection events (throttled to 16ms for performance)
  useThrottledEvents(
    client,
    [
      ClientEvents.INITIALIZED,
      ClientEvents.WEBSOCKET_CLOSED,
      ClientEvents.CONNECTING,
    ],
    updateConnectionState,
    [updateConnectionState],
    16,
  )

  // Track reconnecting state separately (emitted by VisibilityManager on visibility change)
  useEffect(() => {
    if (!client) return

    const onReconnecting = () => setReconnecting(true)
    const onConnected = () => setReconnecting(false)

    client.on(ClientEvents.WEBSOCKET_RECONNECTING, onReconnecting)
    client.on(ClientEvents.INITIALIZED, onConnected)

    return () => {
      client.off(ClientEvents.WEBSOCKET_RECONNECTING, onReconnecting)
      client.off(ClientEvents.INITIALIZED, onConnected)
    }
  }, [client])

  // Initialize state on mount
  useEffect(() => {
    if (!client) return
    updateConnectionState()
  }, [client, updateConnectionState])

  return {
    isOffline,
    isOnline,
    isConnecting,
    isReconnecting,
  }
}
