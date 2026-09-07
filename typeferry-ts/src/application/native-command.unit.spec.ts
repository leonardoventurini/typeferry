import { PassThrough, Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import { createNativeOutputWriter, executeNativeCommand, NativeCommandInterruptedError } from './native-command'

describe('native command execution', () => {
  it('passes arguments literally without a shell and captures both output channels', async () => {
    const literal = 'space $(not-a-command); "quoted"'
    const result = await executeNativeCommand(process.execPath, [
      '-e', 'process.stdout.write(process.argv[1]); process.stderr.write("diagnostic")', literal,
    ])
    expect(result).toEqual({ stdout: literal, stderr: 'diagnostic' })
  })

  it('reports command failure with useful output', async () => {
    await expect(executeNativeCommand(process.execPath, [
      '-e', 'process.stderr.write("fixture failed"); process.exitCode = 7',
    ])).rejects.toThrow(/exit code 7.*fixture failed/su)
  })

  it('stops a timed out child rather than leaving it running', async () => {
    await expect(executeNativeCommand(process.execPath, [
      '-e', 'setInterval(() => {}, 1000)',
    ], { timeoutMs: 100 })).rejects.toThrow(/timed out/u)
  })

  it('cancels an operation through its signal', async () => {
    const controller = new AbortController()
    const pending = executeNativeCommand(process.execPath, [
      '-e', 'setInterval(() => {}, 1000)',
    ], { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(NativeCommandInterruptedError)
  })

  it('bounds captured output', async () => {
    await expect(executeNativeCommand(process.execPath, [
      '-e', 'process.stdout.write("x".repeat(9 * 1024 * 1024))',
    ])).rejects.toThrow(/output exceeded/u)
  })
})


describe('native output backpressure', () => {
  it('pauses output until the destination drains and removes its listener', async () => {
    const source = new PassThrough()
    const destination = new Writable({ highWaterMark: 1, write(_chunk, _encoding, callback) { setImmediate(callback) } })
    const writer = createNativeOutputWriter(source, destination)
    const drained = new Promise<void>(resolve => destination.once('drain', resolve))

    source.resume()
    writer.write('output')
    expect(source.isPaused()).toBe(true)
    await drained
    expect(source.isPaused()).toBe(false)
    expect(destination.listenerCount('drain')).toBe(0)
    writer.dispose()
    source.destroy()
    destination.destroy()
  })

  it('releases a paused source on cancellation without waiting for a blocked destination', () => {
    const source = new PassThrough()
    const destination = new Writable({ highWaterMark: 1, write() { /* Deliberately blocked consumer. */ } })
    const writer = createNativeOutputWriter(source, destination)

    writer.write('output')
    expect(source.isPaused()).toBe(true)
    writer.dispose()
    expect(source.isPaused()).toBe(false)
    expect(destination.listenerCount('drain')).toBe(0)
    writer.write('discarded after cancellation')
    expect(destination.writableLength).toBe(Buffer.byteLength('output'))
    source.destroy()
    destination.destroy()
  })

  it('cancels a real child while its output is paused without waiting for drain', async () => {
    const controller = new AbortController()
    const originalDrainListeners = process.stdout.listenerCount('drain')
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => {
      setImmediate(() => controller.abort())
      return false
    })
    try {
      await expect(executeNativeCommand(process.execPath, [
        '-e', 'process.stdout.write("ready"); setInterval(() => process.stdout.write("more"), 10)',
      ], { stream: true, signal: controller.signal, timeoutMs: 2000 })).rejects.toBeInstanceOf(NativeCommandInterruptedError)
      expect(process.stdout.listenerCount('drain')).toBe(originalDrainListeners)
    } finally {
      output.mockRestore()
    }
  })

  it('retains only the diagnostic tail while streaming the whole output', async () => {
    let written = 0
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      written += Buffer.byteLength(chunk)
      return true
    })
    try {
      const result = await executeNativeCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000) + "END")'], { stream: true })
      expect(written).toBe(100003)
      expect(result.stdout).toHaveLength(16 * 1024)
      expect(result.stdout.endsWith('END')).toBe(true)
    } finally {
      output.mockRestore()
    }
  })
})
