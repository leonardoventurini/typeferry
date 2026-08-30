import { type ChildProcess, spawn } from 'node:child_process'
import { createWriteStream, type WriteStream } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import kill from 'tree-kill'
import { context, type BuildContext } from 'esbuild'
import { createServer, type ViteDevServer } from 'vite'

interface ManagedProcess {
  readonly name: string
  readonly process: ChildProcess
}

export interface ServerLaunchOptions {
  readonly entryPath: string
  readonly environmentFile: string
}

export const SHUTDOWN_SIGNALS = [
  'SIGUSR2',
  'SIGINT',
  'SIGQUIT',
  'SIGTERM',
  'SIGHUP',
] as const

const CLIENT_PORT = 8000
const LOG_FILE = resolve(process.cwd(), 'dev.log')
const DEFAULT_SERVER_LAUNCH_OPTIONS: ServerLaunchOptions = {
  entryPath: './dist/server/index.cjs',
  environmentFile: process.env['DEVELOP_ENV_FILE'] ?? '.env.server',
}

let logStream: WriteStream | undefined

export function buildServerArgs(
  args: readonly string[],
  options: ServerLaunchOptions = DEFAULT_SERVER_LAUNCH_OPTIONS,
): string[] {
  return [
    '--watch',
    `--env-file=${options.environmentFile}`,
    options.entryPath,
    ...args,
  ]
}

async function startBackendCompiler(): Promise<BuildContext> {
  const compiler = await context({
    bundle: true,
    entryPoints: ['src/server/index.ts'],
    format: 'cjs',
    outfile: 'dist/server/index.cjs',
    platform: 'node',
    sourcemap: true,
    supported: { decorators: false },
  })
  await compiler.rebuild()
  await compiler.watch()
  return compiler
}

function writeTaggedOutput(tag: string, data: string): void {
  const line = `[${tag}] ${data}`
  process.stdout.write(line)
  logStream?.write(line)
}

async function startVite(): Promise<ViteDevServer> {
  const server = await createServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    server: {
      allowedHosts: true,
      host: '0.0.0.0',
      port: CLIENT_PORT,
      hmr: { overlay: true },
    },
  })

  await server.listen()
  return server
}

function startBackend(): ChildProcess {
  const child = spawn(
    process.execPath,
    buildServerArgs(process.argv.slice(2)),
    {
      cwd: process.cwd(),
      detached: false,
      stdio: ['inherit', 'pipe', 'pipe'],
    },
  )

  child.stdout?.on('data', (chunk: Buffer) =>
    writeTaggedOutput('server', chunk.toString()),
  )
  child.stderr?.on('data', (chunk: Buffer) =>
    writeTaggedOutput('server', chunk.toString()),
  )
  return child
}

function stopProcess({ name, process: child }: ManagedProcess): Promise<void> {
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

      writeTaggedOutput('develop', `${name} SIGTERM failed: ${error.message}\n`)
      kill(processId, 'SIGKILL', killError => {
        if (killError) {
          writeTaggedOutput(
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

async function run(): Promise<void> {
  logStream = createWriteStream(LOG_FILE, { flags: 'w' })
  logStream.write(`--- started ${new Date().toISOString()} ---\n`)

  const vite = await startVite()
  const backendCompiler = await startBackendCompiler()
  const backend = startBackend()
  process.stdout.write(`Template running at http://localhost:${CLIENT_PORT}/\n`)

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    writeTaggedOutput('develop', `received ${signal}; shutting down\n`)
    await Promise.all([
      stopProcess({ name: 'backend', process: backend }),
      backendCompiler.dispose(),
      vite.close(),
    ])
    logStream?.end()
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

const executablePath = process.argv[1]
if (executablePath && import.meta.url === pathToFileURL(executablePath).href) {
  run().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
