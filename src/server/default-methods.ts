import type { z } from 'zod'

import { Methods } from '../utils'
import type { Method } from './method'
import { rpcLogout, rpcOff, rpcOn } from './methods'
import type { Server } from './server'

type MethodBuilder<
  Schema extends z.ZodUndefined | z.ZodObject<any> = z.ZodUndefined,
  Result = any,
> = (server: Server, name: string) => Method<Schema, Result>

export const DefaultMethods: {
  [key: string]: MethodBuilder
} = {
  [Methods.RPC_ON]: rpcOn,
  [Methods.RPC_OFF]: rpcOff,
  [Methods.RPC_LOGOUT]: rpcLogout,
}
