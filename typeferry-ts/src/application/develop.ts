import { type ChildProcess, spawn } from 'node:child_process'
import { createWriteStream, type WriteStream } from 'node:fs'
import path from 'node:path'

import { context, type BuildContext } from 'esbuild'
import kill from 'tree-kill'
import { createServer, type ViteDevServer } from 'vite'

import type { ResolvedApplicationConfig } from './config'
import { createServerBuildOptions } from './server-build'
import { createViteConfig } from './vite-config'

interface ManagedProcess {
  readonly name: string
  readonly process: ChildProcess
}

export const SHUTDOWN_SIGNALS = [
  'SIGUSR2',
  'SIGINT',
  'SIGQUIT',
  'SIGTERM',
  'SIGHUP',
] as const

export function buildServerArguments(
  config: ResolvedApplicationConfig,
  arguments_: readonly string[],
): string[] {
  return [
    '--watch',
    `--env-file=${config.development.serverEnvironmentFile}`,
    path.join(config.paths.output, 'server', 'index.cjs'),
    ...arguments_,
  ]
}

export async function runDevelop(
  config: ResolvedApplicationConfig,
  serverArguments: readonly string[],
): Promise<void> {
  const logStream = createWriteStream(path.join(config.root, 'dev.log'), {
    flags: 'w',
  })
  logStream.write(`--- started ${new Date().toISOString()} ---\n`)

  const vite = await startVite(config)
  const backendCompiler = await startBackendCompiler(config)
  const backend = startBackend(config, serverArguments, logStream)
  process.stdout.write(
    `TypeFerry application running at http://localhost:${config.development.clientPort}/\n`,
  )

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    writeTaggedOutput(
      logStream,
      'develop',
      `received ${signal}; shutting down\n`,
    )
    await Promise.all([
      stopProcess({ name: 'backend', process: backend }, logStream),
      backendCompiler.dispose(),
      vite.close(),
    ])
    logStream.end()
  }

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => {
      void shutdown(signal).then(() => {
        process.exit(0)
      })
    })
  }

  backend.once('exit', code => {
    if (!shuttingDown && code !== 0) {
      void shutdown(`backend exit ${code ?? 'unknown'}`).then(() => {
        process.exit(code ?? 1)
      })
    }
  })
}

async function startVite(
  config: ResolvedApplicationConfig,
): Promise<ViteDevServer> {
  const server = await createServer(createViteConfig(config, 'develop'))
  await server.listen()
  return server
}

async function startBackendCompiler(
  config: ResolvedApplicationConfig,
): Promise<BuildContext> {
  const compiler = await context(createServerBuildOptions(config))
  await compiler.rebuild()
  await compiler.watch()
  return compiler
}

function startBackend(
  config: ResolvedApplicationConfig,
  arguments_: readonly string[],
  logStream: WriteStream,
): ChildProcess {
  const child = spawn(
    process.execPath,
    buildServerArguments(config, arguments_),
    {
      cwd: config.root,
      detached: false,
      stdio: ['inherit', 'pipe', 'pipe'],
    },
  )

  child.stdout?.on('data', (chunk: Buffer) =>
    writeTaggedOutput(logStream, 'server', chunk.toString()),
  )
  child.stderr?.on('data', (chunk: Buffer) =>
    writeTaggedOutput(logStream, 'server', chunk.toString()),
  )
  return child
}

function writeTaggedOutput(
  logStream: WriteStream,
  tag: string,
  data: string,
): void {
  const line = `[${tag}] ${data}`
  process.stdout.write(line)
  logStream.write(line)
}

function stopProcess(
  { name, process: child }: ManagedProcess,
  logStream: WriteStream,
): Promise<void> {
  return new Promise(resolveStop => {
    const processId = child.pid
    if (processId === undefined || child.exitCode !== null) {
      resolveStop()
      return
    }

    let completed = false
    const finish = (): void => {
      if (!completed) {
        completed = true
        resolveStop()
      }
    }

    child.once('exit', finish)
    kill(processId, 'SIGTERM', error => {
      if (!error) return

      writeTaggedOutput(
        logStream,
        'develop',
        `${name} SIGTERM failed: ${error.message}\n`,
      )
      kill(processId, 'SIGKILL', killError => {
        if (killError) {
          writeTaggedOutput(
            logStream,
            'develop',
            `${name} SIGKILL failed: ${killError.message}\n`,
          )
        }
        finish()
      })
    })

    setTimeout(() => {
      kill(processId, 'SIGKILL', () => finish())
    }, 2_000).unref()
    setTimeout(finish, 10_000).unref()
  })
}
