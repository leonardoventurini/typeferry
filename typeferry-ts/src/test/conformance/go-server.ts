import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const GO_DIR = path.resolve(import.meta.dirname, '../../../../typeferry-go')
const START_TIMEOUT_MS = 30_000
const STOP_TIMEOUT_MS = 2000
const run = promisify(execFile)

export interface GoConformanceServer {
  port: number
  close(): Promise<void>
}

/**
 * Compile and own the fixture executable directly. Killing a `go run` parent
 * does not prove its compiled child exited; both suites join this owned process
 * before removing their temporary build directory.
 */
export async function startGoConformanceServer(): Promise<GoConformanceServer> {
  const directory = await mkdtemp(path.join(tmpdir(), 'typeferry-go-conformance-'))
  const executable = path.join(directory, 'server')

  try {
    await run('go', ['build', '-o', executable, './cmd/typeferry-conformance-server'], { cwd: GO_DIR })
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }

  const child = spawn(executable, [], { stdio: ['ignore', 'pipe', 'pipe'] })
  const joined = new Promise<void>(resolve => {
    child.once('exit', () => resolve())
    child.once('error', () => resolve())
  })
  let closing: Promise<void> | undefined

  async function exitedWithinBudget(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        joined.then(() => true),
        new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), STOP_TIMEOUT_MS) }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  function close(): Promise<void> {
    closing ??= (async () => {
      child.kill('SIGTERM')
      if (!await exitedWithinBudget()) {
        child.kill('SIGKILL')
        if (!await exitedWithinBudget()) throw new Error('Go fixture did not exit after forced shutdown')
      }
      await rm(directory, { recursive: true, force: true })
    })()
    return closing
  }

  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Go server startup timed out')), START_TIMEOUT_MS)
      let output = ''
      child.stderr?.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8')
        const match = output.match(/TYPEFERRY_PORT=(\d+)/)
        if (match?.[1]) {
          clearTimeout(timer)
          resolve(Number.parseInt(match[1], 10))
        }
      })
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Go server exited with ${code}`)) })
    })
    return { port, close }
  } catch (error) {
    await close()
    throw error
  }
}
