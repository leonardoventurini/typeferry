import type { MiddlewareHandler } from 'hono'

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  windowMs: number
  max: number
}

/**
 * Simple sliding-window IP rate limiter for Hono.
 * Replaces `express-rate-limit` for the Bun transport path.
 */
export function rateLimiter(opts: RateLimitOptions): MiddlewareHandler {
  const store = new Map<string, RateLimitEntry>()

  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key)
    }
  }, opts.windowMs)

  return async (c, next) => {
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
}
