import type { MiddlewareHandler } from 'hono'

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  windowMs: number
  max: number
}

/** Hono middleware whose cleanup timer follows its owning transport lifecycle. */
export type DisposableRateLimiter = MiddlewareHandler & {
  close(): void
}

/**
 * Simple sliding-window IP rate limiter for Hono.
 * Applies per-client HTTP RPC limits within Hono.
 */
export function rateLimiter(opts: RateLimitOptions): DisposableRateLimiter {
  const store = new Map<string, RateLimitEntry>()

  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key)
    }
  }, opts.windowMs)
  // A limiter must never keep an otherwise-closed Node process alive.
  cleanupTimer.unref()

  const middleware: DisposableRateLimiter = async (c, next) => {
    const ip = c.req.header('x-forwarded-for') ?? '127.0.0.1'
    const now = Date.now()

    let entry = store.get(ip)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs }
      store.set(ip, entry)
    }

    entry.count++

    if (entry.count > opts.max) {
      return c.text('Too Many Requests', 429)
    }

    await next()
  }

  middleware.close = (): void => {
    clearInterval(cleanupTimer)
    store.clear()
  }

  return middleware
}
