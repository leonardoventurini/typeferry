import { useContext } from 'react'

import type { Client } from '../../client'
import type { ServerMethods } from '../../utils'
import { Environment } from '../../utils'
import { ClientContext } from '../components'

export function useClient<
  T extends ServerMethods = ServerMethods,
>(): Client<T> | null {
  const client = useContext(ClientContext)

  if (Environment.isServer) return null

  if (!client) {
    throw new Error('Client Not Found')
  }

  // Method schemas are compile-time-only; every Client<T> shares the same
  // runtime instance and the provider cannot retain a consumer's T parameter.
  return client as unknown as Client<T>
}
