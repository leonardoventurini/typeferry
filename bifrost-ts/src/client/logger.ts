/**
 * Centralized logging for Bifrost client.
 * Provides structured logging with categories and levels for easier debugging.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export enum LogCategory {
  CONNECTION = 'connection',
  AUTH = 'auth',
  METHOD = 'method',
  SUBSCRIPTION = 'subscription',
  CHANNEL = 'channel',
}

export interface LogEntry {
  level: LogLevel
  category: LogCategory
  message: string
  context?: Record<string, unknown>
  error?: Error
  timestamp: number
}

export type LogListener = (entry: LogEntry) => void

/**
 * Logger for Bifrost client with structured logging support.
 *
 * @example
 * ```ts
 * const logger = new BifrostLogger()
 * logger.setLevel(LogLevel.DEBUG)
 *
 * // Subscribe to all logs
 * const unsubscribe = logger.onLog(entry => {
 *   // Send to external service
 * })
 *
 * // Log with context
 * logger.method(LogLevel.ERROR, 'Method call failed', {
 *   method: 'boards.get',
 *   timeout: 30000,
 * })
 * ```
 */
export class BifrostLogger {
  private level: LogLevel = LogLevel.WARN
  private listeners: Set<LogListener> = new Set()

  /**
   * Set the minimum log level. Messages below this level are ignored.
   */
  setLevel(level: LogLevel): void {
    this.level = level
  }

  /**
   * Get the current log level.
   */
  getLevel(): LogLevel {
    return this.level
  }

  /**
   * Subscribe to log entries.
   * Returns an unsubscribe function.
   */
  onLog(listener: LogListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Core logging method.
   */
  log(entry: Omit<LogEntry, 'timestamp'>): void {
    if (entry.level < this.level) return

    const fullEntry: LogEntry = { ...entry, timestamp: Date.now() }
    this.output(fullEntry)
    this.listeners.forEach(listener => listener(fullEntry))
  }

  private output(entry: LogEntry): void {
    const prefix = `[Bifrost:${entry.category}]`
    const args: unknown[] = [prefix, entry.message]

    if (entry.context) args.push(entry.context)
    if (entry.error) args.push(entry.error)

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(...args)
        break
      case LogLevel.INFO:
        console.log(...args)
        break
      case LogLevel.WARN:
        console.warn(...args)
        break
      case LogLevel.ERROR:
        console.error(...args)
        break
    }
  }

  // Category-specific convenience methods

  connection(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    this.log({
      level,
      category: LogCategory.CONNECTION,
      message,
      context,
      error,
    })
  }

  auth(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    this.log({ level, category: LogCategory.AUTH, message, context, error })
  }

  method(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    this.log({ level, category: LogCategory.METHOD, message, context, error })
  }

  subscription(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    this.log({
      level,
      category: LogCategory.SUBSCRIPTION,
      message,
      context,
      error,
    })
  }

  channel(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    this.log({ level, category: LogCategory.CHANNEL, message, context, error })
  }
}

/** Shared logger instance for the Bifrost client. */
export const logger = new BifrostLogger()
