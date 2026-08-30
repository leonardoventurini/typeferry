import { env } from '@/server/config/environment'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogContext = Readonly<Record<string, unknown>>

const levelPriority: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    }
  }

  return value
}

function write(level: LogLevel, context: LogContext, message: string): void {
  if (levelPriority[level] < levelPriority[env.LOG_LEVEL]) return

  const serializedContext = Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, serializeValue(value)]),
  )
  const entry = JSON.stringify({
    ...serializedContext,
    timestamp: new Date().toISOString(),
    level,
    message,
  })

  const stream = level === 'error' ? process.stderr : process.stdout
  stream.write(`${entry}\n`)
}

/** Small structured logger with Pino-style context-first call signatures. */
export const logger = {
  debug(context: LogContext, message: string): void {
    write('debug', context, message)
  },
  info(context: LogContext, message: string): void {
    write('info', context, message)
  },
  warn(context: LogContext, message: string): void {
    write('warn', context, message)
  },
  error(context: LogContext, message: string): void {
    write('error', context, message)
  },
}
