import { useContext } from 'react'

import type { Client } from '../../client'
import type { ServerMethods } from '../../utils'
import { Environment } from '../../utils'
import { ClientContext } from '../components'

export function useClient<
  T extends ServerMethods = ServerMethods,
>(): Client<T> {
  const client = useContext(ClientContext)

  if (Environment.isServer) return null

  if (!client) {
    throw new Error('Client Not Found')
  }

  return client
}
