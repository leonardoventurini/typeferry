import type { Client } from '../client'
import type { ServerMethods } from '../utils'
import { useClient } from './hooks/use-client'
import type { UseMethodParams } from './hooks/use-method'

declare const client: ReturnType<typeof useClient>

if (client) client.call('health')

// @ts-expect-error Server rendering deliberately has no client instance.
const guaranteedClient: Client<ServerMethods> = client

const validMethod: UseMethodParams<{ id: string }, number> = {
  method: 'items.count',
  params: { id: 'item-1' },
  defaultValue: 0,
  parse: params => params.id.length,
}

void guaranteedClient
void validMethod

const invalidMethod: UseMethodParams<{ id: string }, number> = {
  method: 'items.count',
  params: { id: 'item-1' },
  // @ts-expect-error The fallback must match the declared result contract.
  defaultValue: 'zero',
}

void invalidMethod
