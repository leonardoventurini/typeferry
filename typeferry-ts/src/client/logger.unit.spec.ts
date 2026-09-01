import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TypeFerryLogger, LogCategory, LogLevel, logger } from './logger'

describe('TypeFerryLogger', () => {
  let log: TypeFerryLogger

  beforeEach(() => {
    log = new TypeFerryLogger()
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Level management (lines 67-68)
  // -------------------------------------------------------------------------

  describe('getLevel / setLevel', () => {
    it('defaults to WARN', () => {
      expect(log.getLevel()).toBe(LogLevel.WARN)
    })

    it('returns updated level after setLevel()', () => {
      log.setLevel(LogLevel.DEBUG)
      expect(log.getLevel()).toBe(LogLevel.DEBUG)
    })
  })

  // -------------------------------------------------------------------------
  // onLog listener management (lines 75-79)
  // -------------------------------------------------------------------------

  describe('onLog', () => {
    it('calls listener when a log entry is emitted', () => {
      log.setLevel(LogLevel.DEBUG)
      const listener = vi.fn()
      log.onLog(listener)

      log.log({ level: LogLevel.DEBUG, category: LogCategory.CONNECTION, message: 'test' })

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.DEBUG,
          category: LogCategory.CONNECTION,
          message: 'test',
          timestamp: expect.any(Number),
        }),
      )
    })

    it('returns an unsubscribe function that removes the listener', () => {
      log.setLevel(LogLevel.DEBUG)
      const listener = vi.fn()
      const unsub = log.onLog(listener)

      log.log({ level: LogLevel.DEBUG, category: LogCategory.AUTH, message: 'first' })
      expect(listener).toHaveBeenCalledTimes(1)

      unsub()

      log.log({ level: LogLevel.DEBUG, category: LogCategory.AUTH, message: 'second' })
      expect(listener).toHaveBeenCalledTimes(1) // not called again
    })
  })

  // -------------------------------------------------------------------------
  // Core log method (lines 85-91) — filtering by level
  // -------------------------------------------------------------------------

  describe('log()', () => {
    it('suppresses entries below current level', () => {
      log.setLevel(LogLevel.ERROR)
      const listener = vi.fn()
      log.onLog(listener)

      log.log({ level: LogLevel.DEBUG, category: LogCategory.CONNECTION, message: 'x' })
      log.log({ level: LogLevel.INFO, category: LogCategory.CONNECTION, message: 'x' })
      log.log({ level: LogLevel.WARN, category: LogCategory.CONNECTION, message: 'x' })

      expect(listener).not.toHaveBeenCalled()
    })

    it('emits entries at or above current level', () => {
      log.setLevel(LogLevel.WARN)
      const listener = vi.fn()
      log.onLog(listener)

      log.log({ level: LogLevel.WARN, category: LogCategory.CONNECTION, message: 'warn' })
      log.log({ level: LogLevel.ERROR, category: LogCategory.CONNECTION, message: 'error' })

      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('attaches a timestamp to the entry', () => {
      log.setLevel(LogLevel.DEBUG)
      const listener = vi.fn()
      log.onLog(listener)

      const before = Date.now()
      log.log({ level: LogLevel.DEBUG, category: LogCategory.AUTH, message: 'ts' })
      const after = Date.now()

      const entry = listener.mock.calls[0][0]
      expect(entry.timestamp).toBeGreaterThanOrEqual(before)
      expect(entry.timestamp).toBeLessThanOrEqual(after)
    })
  })

  // -------------------------------------------------------------------------
  // output() — console dispatch per level (lines 93-114)
  // -------------------------------------------------------------------------

  describe('output (console dispatch)', () => {
    beforeEach(() => {
      log.setLevel(LogLevel.DEBUG)
    })

    it('routes DEBUG to console.debug', () => {
      log.log({ level: LogLevel.DEBUG, category: LogCategory.CONNECTION, message: 'dbg' })
      expect(console.debug).toHaveBeenCalledWith('[TypeFerry:connection]', 'dbg')
    })

    it('routes INFO to console.log', () => {
      log.log({ level: LogLevel.INFO, category: LogCategory.AUTH, message: 'inf' })
      expect(console.log).toHaveBeenCalledWith('[TypeFerry:auth]', 'inf')
    })

    it('routes WARN to console.warn', () => {
      log.log({ level: LogLevel.WARN, category: LogCategory.METHOD, message: 'wrn' })
      expect(console.warn).toHaveBeenCalledWith('[TypeFerry:method]', 'wrn')
    })

    it('routes ERROR to console.error', () => {
      log.log({ level: LogLevel.ERROR, category: LogCategory.SUBSCRIPTION, message: 'err' })
      expect(console.error).toHaveBeenCalledWith('[TypeFerry:subscription]', 'err')
    })

    it('includes context object when provided', () => {
      const ctx = { method: 'boards.get' }
      log.log({
        level: LogLevel.WARN,
        category: LogCategory.METHOD,
        message: 'ctx test',
        context: ctx,
      })
      expect(console.warn).toHaveBeenCalledWith('[TypeFerry:method]', 'ctx test', ctx)
    })

    it('includes error object when provided', () => {
      const err = new Error('boom')
      log.log({
        level: LogLevel.ERROR,
        category: LogCategory.CONNECTION,
        message: 'err test',
        error: err,
      })
      expect(console.error).toHaveBeenCalledWith('[TypeFerry:connection]', 'err test', err)
    })

    it('includes both context and error when both provided', () => {
      const ctx = { key: 'val' }
      const err = new Error('fail')
      log.log({
        level: LogLevel.ERROR,
        category: LogCategory.CONNECTION,
        message: 'both',
        context: ctx,
        error: err,
      })
      expect(console.error).toHaveBeenCalledWith('[TypeFerry:connection]', 'both', ctx, err)
    })
  })

  // -------------------------------------------------------------------------
  // Category convenience methods (lines 118-173)
  // -------------------------------------------------------------------------

  describe('category convenience methods', () => {
    beforeEach(() => {
      log.setLevel(LogLevel.DEBUG)
    })

    it('connection() logs with CONNECTION category', () => {
      log.connection(LogLevel.DEBUG, 'conn msg', { host: 'localhost' })
      expect(console.debug).toHaveBeenCalledWith(
        '[TypeFerry:connection]',
        'conn msg',
        { host: 'localhost' },
      )
    })

    it('auth() logs with AUTH category', () => {
      log.auth(LogLevel.INFO, 'auth msg')
      expect(console.log).toHaveBeenCalledWith('[TypeFerry:auth]', 'auth msg')
    })

    it('method() logs with METHOD category', () => {
      const err = new Error('timeout')
      log.method(LogLevel.ERROR, 'method msg', { method: 'x' }, err)
      expect(console.error).toHaveBeenCalledWith(
        '[TypeFerry:method]',
        'method msg',
        { method: 'x' },
        err,
      )
    })

    it('subscription() logs with SUBSCRIPTION category', () => {
      log.subscription(LogLevel.WARN, 'sub msg')
      expect(console.warn).toHaveBeenCalledWith('[TypeFerry:subscription]', 'sub msg')
    })

    it('channel() logs with CHANNEL category', () => {
      log.channel(LogLevel.DEBUG, 'ch msg')
      expect(console.debug).toHaveBeenCalledWith('[TypeFerry:channel]', 'ch msg')
    })
  })

  // -------------------------------------------------------------------------
  // Shared singleton
  // -------------------------------------------------------------------------

  describe('shared logger instance', () => {
    it('exports a singleton logger', () => {
      expect(logger).toBeInstanceOf(TypeFerryLogger)
    })
  })
})
