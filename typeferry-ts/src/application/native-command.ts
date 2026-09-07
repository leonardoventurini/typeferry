import { spawn } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'

const CAPTURE_LIMIT = 8 * 1024 * 1024
const DIAGNOSTIC_LIMIT = 16 * 1024
const QUERY_TIMEOUT_MS = 120_000

export interface NativeCommandOptions {
  readonly cwd?: string
  readonly timeoutMs?: number
  readonly stream?: boolean
  readonly signal?: AbortSignal
}

export interface NativeCommandOutput {
  readonly stdout: string
  readonly stderr: string
}

export type NativeCommandRunner = (
  executable: string,
  arguments_: readonly string[],
  options?: NativeCommandOptions,
) => Promise<NativeCommandOutput>

/**
 * Allows the CLI to preserve conventional cancellation exit codes without
 * reporting an interrupted log stream as a configuration failure.
 */
export class NativeCommandInterruptedError extends Error {
  readonly exitCode: number

  constructor(signal: NodeJS.Signals) {
    super(`Native command interrupted by ${signal}`)
    this.exitCode = signal === 'SIGINT' ? 130 : 143
  }
}

/**
 * Couples one child output channel to its destination without accumulating an
 * unbounded writable queue. Disposal drains remaining child output so a paused
 * pipe cannot prevent cancellation from reaching the child's close event.
 */
export function createNativeOutputWriter(source: Readable, destination: Writable): {
  write(chunk: string): void
  dispose(): void
} {
  let disposed = false
  const resume = (): void => { source.resume() }

  return {
    write(chunk) {
      if (disposed) return
      if (!destination.write(chunk)) {
        source.pause()
        destination.once('drain', resume)
      }
    },
    dispose() {
      disposed = true
      destination.removeListener('drain', resume)
      source.resume()
    },
  }
}

/**
 * Executes argument arrays directly. Long-running commands stream output while
 * retaining only a bounded diagnostic tail; structured queries have a hard cap.
 * Interruptions and timeouts terminate the child process group on Unix systems.
 */
export const executeNativeCommand: NativeCommandRunner = (executable, arguments_, options = {}) => {
  if (options.signal?.aborted) return Promise.reject(new NativeCommandInterruptedError('SIGINT'))

  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...arguments_], {
      cwd: options.cwd,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const writers = {
      stdout: createNativeOutputWriter(child.stdout, process.stdout),
      stderr: createNativeOutputWriter(child.stderr, process.stderr),
    }
    const disposeOutput = (): void => {
      writers.stdout.dispose()
      writers.stderr.dispose()
    }
    let stdout = ''
    let stderr = ''
    let bytes = 0
    let failure: Error | undefined
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined

    const kill = (signal: NodeJS.Signals): void => {
      if (!child.pid) return
      try {
        if (process.platform === 'win32') child.kill(signal)
        else process.kill(-child.pid, signal)
      } catch {
        // The process may have exited between cancellation and signal delivery.
      }
    }
    const stop = (error: Error, signal: NodeJS.Signals = 'SIGTERM'): void => {
      if (failure) return
      failure = error
      disposeOutput()
      kill(signal)
      killTimer = setTimeout(() => kill('SIGKILL'), 2_000)
      killTimer.unref()
    }
    const onInterrupt = (): void => stop(new NativeCommandInterruptedError('SIGINT'), 'SIGINT')
    const onTerminate = (): void => stop(new NativeCommandInterruptedError('SIGTERM'))
    const cleanup = (): void => {
      disposeOutput()
      clearTimeout(timeout)
      clearTimeout(killTimer)
      process.removeListener('SIGINT', onInterrupt)
      process.removeListener('SIGTERM', onTerminate)
      options.signal?.removeEventListener('abort', onInterrupt)
    }
    const consume = (channel: 'stdout' | 'stderr', chunk: string): void => {
      if (failure) return
      if (options.stream) writers[channel].write(chunk)
      else {
        bytes += Buffer.byteLength(chunk)
        if (bytes > CAPTURE_LIMIT) {
          stop(new Error(`${executable} output exceeded ${CAPTURE_LIMIT} bytes`))
          return
        }
      }
      const limit = options.stream ? DIAGNOSTIC_LIMIT : CAPTURE_LIMIT
      if (channel === 'stdout') stdout = (stdout + chunk).slice(-limit)
      else stderr = (stderr + chunk).slice(-limit)
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => consume('stdout', chunk))
    child.stderr.on('data', (chunk: string) => consume('stderr', chunk))
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    options.signal?.addEventListener('abort', onInterrupt, { once: true })

    const timeoutMs = options.timeoutMs ?? (options.stream ? undefined : QUERY_TIMEOUT_MS)
    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => stop(new Error(`${executable} timed out after ${timeoutMs}ms`)), timeoutMs)
      timeout.unref()
    }
    child.once('error', error => {
      cleanup()
      reject(new Error(`Unable to execute ${executable}: ${error.message}`, { cause: error }))
    })
    child.once('close', (code, signal) => {
      cleanup()
      if (failure) reject(failure)
      else if (signal) reject(new NativeCommandInterruptedError(signal))
      else if (code !== 0) reject(new Error(`${executable} failed with exit code ${code}:\n${(stderr || stdout).slice(-DIAGNOSTIC_LIMIT).trim()}`))
      else resolve({ stdout, stderr })
    })
  })
}
