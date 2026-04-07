import useCreation from 'ahooks/lib/useCreation'
import type { PropsWithChildren } from 'react'
import React, { useEffect } from 'react'

import type { ClientOptions } from '../../client'
import { Client } from '../../client'

export const ClientContext = React.createContext(undefined)

ClientContext.displayName = 'BifrostClientContext'

export const ClientProvider = ({
  clientInstance = null,
  clientOptions,
  children,
}: PropsWithChildren<{
  clientOptions?: ClientOptions
  clientInstance?: Client
}>) => {
  const client = useCreation(() => {
    return clientInstance ?? new Client(clientOptions)
  }, [])

  /**
   * Close the client on unmount to prevent ghost WebSocket connections
   * during HMR. Without this, each hot reload of App or ClientProvider
   * orphans the old Client's socket, leaking server-side connections.
   */
  useEffect(() => {
    return () => {
      client?.close()
    }
  }, [client])

  return (
    <ClientContext.Provider value={client}>
      {client ? children : null}
    </ClientContext.Provider>
  )
}
