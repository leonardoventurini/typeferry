import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { Readable } from 'node:stream'
import { ServerResponse } from 'node:http'

const TOO_LARGE = 'Request Entity Too Large'

/**
 * Pass chunks only on consumer demand. Native byte-sized queueing avoids the
 * Node-to-Web default count strategy treating a byte high-water mark as a chunk
 * count. Unlike buffered limits, routes own authentication and verified EOF.
 */
export function streamingBodyLimit(maxSize: number): MiddlewareHandler {
  return async (c, next) => {
    const original = c.req.raw
    const env: unknown = c.env
    const incoming =
      typeof env === 'object' &&
      env !== null &&
      'incoming' in env &&
      env.incoming instanceof Readable
        ? env.incoming
        : undefined
    const outgoing =
      typeof env === 'object' &&
      env !== null &&
      'outgoing' in env &&
      env.outgoing instanceof ServerResponse
        ? env.outgoing
        : undefined
    if (original.method === 'GET' || original.method === 'HEAD') return next()
    const declared = original.headers.get('content-length')
    if (
      declared !== null &&
      /^\d+$/u.test(declared) &&
      Number(declared) > maxSize
    )
      return c.text(TOO_LARGE, 413)

    // Accessing the adapter's .body would eagerly create its default Node/Web
    // bridge. Native input stays paused until the first authenticated read.
    const source = incoming instanceof Readable ? undefined : original.body
    if (!incoming && !source) return next()
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    let ended = false
    let exceeded = false
    let size = 0
    let cancellationScheduled = false

    const cancelSource = (reason?: unknown): void => {
      if (cancellationScheduled || ended || !reader) return
      cancellationScheduled = true
      const cancel = () => {
        outgoing?.off('finish', cancel)
        outgoing?.off('close', cancel)
        const activeReader = reader
        if (activeReader) {
          void activeReader
            .cancel(reason)
            .finally(() => activeReader.releaseLock())
            .catch(() => undefined)
        }
      }
      // Destroying a live IncomingMessage before the error response is written
      // also destroys its socket. Stop consuming now, cancel after response EOF.
      if (
        outgoing &&
        !outgoing.writableFinished &&
        !outgoing.destroyed &&
        !incoming?.destroyed
      ) {
        outgoing.once('finish', cancel)
        outgoing.once('close', cancel)
      } else cancel()
    }
    const abort = () => {
      if (ended) return
      controller?.error(original.signal.reason)
      cancelSource(original.signal.reason)
    }
    const body = new ReadableStream<Uint8Array>(
      {
        start(value) {
          controller = value
        },
        async pull(value) {
          try {
            if (!reader) {
              const input =
                incoming instanceof Readable
                  ? Readable.toWeb(incoming, {
                      strategy: {
                        highWaterMark: incoming.readableHighWaterMark,
                        size: (chunk: unknown) => {
                          if (!(chunk instanceof Uint8Array))
                            throw new TypeError('Invalid native request bytes')
                          return chunk.byteLength
                        },
                      },
                    })
                  : source
              if (!input) throw new Error('Missing streaming request body')
              reader = input.getReader()
            }
            const chunk = await reader.read()
            if (ended || original.signal.aborted) return
            if (chunk.done) {
              ended = true
              reader.releaseLock()
              value.close()
              return
            }
            const bytes: unknown = chunk.value
            if (!(bytes instanceof Uint8Array))
              throw new TypeError('Invalid streaming request bytes')
            size += bytes.byteLength
            if (size > maxSize) {
              exceeded = true
              throw new HTTPException(413, { message: TOO_LARGE })
            }
            value.enqueue(bytes)
          } catch (error) {
            if (!ended && !original.signal.aborted) value.error(error)
            cancelSource(error)
          }
        },
        cancel(reason) {
          cancelSource(reason)
        },
      },
      { highWaterMark: 0 },
    )
    original.signal.addEventListener('abort', abort, { once: true })
    if (original.signal.aborted) abort()
    const init = {
      method: original.method,
      headers: original.headers,
      signal: original.signal,
      body,
      duplex: 'half',
    } as const
    c.req.raw = new Request(original.url, init)
    try {
      await next()
      if (exceeded) {
        c.res = c.text(TOO_LARGE, 413)
        c.res.headers.delete('content-length')
        c.res.headers.delete('content-encoding')
        c.res.headers.delete('content-range')
      }
    } finally {
      original.signal.removeEventListener('abort', abort)
      cancelSource()
    }
  }
}
