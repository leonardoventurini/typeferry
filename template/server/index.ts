import { Server } from '@example-app/bifrost/server'
import path from 'node:path'

import { MESSAGES_CHANGED_EVENT } from '@/common/messages'
import { env } from '@/server/config/environment'
import {
  connectDatabase,
  disconnectDatabase,
  getDatabase,
} from '@/server/data/database'
import { logger } from '@/server/logging/logger'
import { runMigrations } from '@/server/migrations'
import { registerMessageMethods } from '@/server/methods/messages'
import { configureStaticClient } from '@/server/static-client'

interface AuthContext {
  token?: unknown
}

let activeServer: Server | undefined

async function start(): Promise<void> {
  await connectDatabase()
  await runMigrations()

  const server = new Server({
    host: '0.0.0.0',
    port: env.PORT,
    origins: [env.CLIENT_ORIGIN],
    allowedContextKeys: ['token'],
  })
  activeServer = server

  server.acceptConnections = false
  server.setAuth({
    auth(context: AuthContext) {
      if (context.token !== env.SAMPLE_AUTH_TOKEN) return false

      return {
        token: context.token,
        user: { _id: 'sample-user' },
      }
    },
    async logIn(input: unknown): Promise<{ token: string } | undefined> {
      if (
        typeof input !== 'object' ||
        input === null ||
        !('token' in input) ||
        input.token !== env.SAMPLE_AUTH_TOKEN
      ) {
        return undefined
      }

      return { token: env.SAMPLE_AUTH_TOKEN }
    },
  })
  server.addEvent(MESSAGES_CHANGED_EVENT, { user: true })
  registerMessageMethods()
  server.app.get('/healthz', async context => {
    try {
      await getDatabase().command({ ping: 1 })
      return context.json({ status: 'ok' })
    } catch {
      return context.json({ status: 'unavailable' }, 503)
    }
  })

  if (env.NODE_ENV === 'production') {
    await configureStaticClient(server, path.resolve('dist/client'))
  }

  await server.isReady()
  server.acceptConnections = true
  logger.info({ port: server.port }, 'Bifrost server ready')

  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'Shutting down')
    server.acceptConnections = false
    await server.close()
    await disconnectDatabase()
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal)
    })
  }
}

void start().catch(async (error: unknown): Promise<void> => {
  logger.error({ error }, 'Server startup failed')
  await activeServer?.close()
  await disconnectDatabase()
  process.exitCode = 1
})
