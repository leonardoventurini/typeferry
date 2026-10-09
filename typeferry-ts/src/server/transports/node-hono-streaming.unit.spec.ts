import {
  request as createHttpRequest,
  type ClientRequest,
  type RequestListener,
} from 'node:http'

import { describe, expect, it, vi } from 'vitest'

import { Server, type RequestBodySizeLimit } from '../server'

const HOST = '127.0.0.1'
const REQUEST_DEADLINE_MS = 2_000
const STREAMING_RULE = {
  pathPrefix: '/upload',
  maxSize: 32,
  bodyMode: 'streaming',
} as const

async function serverWith(
  rules: readonly RequestBodySizeLimit[] = [STREAMING_RULE],
  observer?: RequestListener,
  maxRequestBodySize = 64,
): Promise<Server> {
  const server = new Server({
    host: HOST,
    port: 0,
    globalInstance: false,
    maxRequestBodySize,
    requestBodySizeLimits: rules,
    ...(observer ? { requestListener: observer } : {}),
  })
  await server.isReady()
  return server
}

/** The client deliberately owns EOF so tests can observe behavior before it. */
function openRequest(
  server: Server,
  path = '/upload',
  headers = {},
): {
  request: ClientRequest
  status: Promise<number>
} {
  let request: ClientRequest | undefined
  const status = new Promise<number>((resolve, reject) => {
    const outgoing = createHttpRequest(
      { hostname: HOST, port: server.port, path, method: 'POST', headers },
      (response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      },
    )
    request = outgoing
    outgoing.once('error', reject)
    outgoing.setTimeout(REQUEST_DEADLINE_MS, () =>
      outgoing.destroy(new Error('Streaming transport waited for EOF')),
    )
  })
  // The synchronous Promise executor initializes the request before returning.
  if (!request) throw new Error('Missing test request')
  return { request, status }
}

const OBSERVERS = [
  { name: 'direct', listener: undefined },
  { name: 'observed', listener: (() => undefined) satisfies RequestListener },
] as const

describe.each(OBSERVERS)(
  'opt-in streaming Node HTTP ($name)',
  ({ listener }) => {
    it('rejects an unauthorized unfinished upload before buffering its body', async () => {
      const server = await serverWith(undefined, listener)
      const handler = vi.fn()
      server.app.post('/upload', (c) => {
        handler()
        return c.text('Unauthorized', 401)
      })
      const outgoing = openRequest(server)
      try {
        outgoing.request.write('x')
        expect(await outgoing.status).toBe(401)
        expect(handler).toHaveBeenCalledOnce()
      } finally {
        outgoing.request.destroy()
        await server.close()
      }
    })

    it('survives disconnect while authentication has not read the body', async () => {
      const server = await serverWith(undefined, listener)
      const started = vi.fn()
      const aborted = vi.fn()
      server.app.post('/upload', async (c) => {
        started()
        await new Promise<void>((resolve) => {
          c.req.raw.signal.addEventListener(
            'abort',
            () => {
              aborted()
              resolve()
            },
            { once: true },
          )
        })
        return c.text('Disconnected', 401)
      })
      const outgoing = openRequest(server)
      void outgoing.status.catch(() => undefined)
      try {
        outgoing.request.write('x')
        await expect.poll(() => started.mock.calls.length).toBe(1)
        outgoing.request.destroy()
        await expect.poll(() => aborted.mock.calls.length).toBe(1)
      } finally {
        outgoing.request.destroy()
        await server.close()
      }
    })

    it('delivers chunks before EOF and verifies complete bounded consumption', async () => {
      const server = await serverWith(undefined, listener)
      const consumed = vi.fn()
      server.app.post('/upload', async (c) => {
        const reader = c.req.raw.body?.getReader()
        if (!reader) return c.text('Missing body', 400)
        let size = 0
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          consumed(size)
        }
        return c.text(String(size))
      })
      const outgoing = openRequest(server)
      try {
        outgoing.request.write('x')
        await expect.poll(() => consumed.mock.calls.length).toBe(1)
        outgoing.request.end('y'.repeat(31))
        expect(await outgoing.status).toBe(200)
        expect(consumed).toHaveBeenLastCalledWith(32)
      } finally {
        outgoing.request.destroy()
        // Attach rejection handling even when the before-EOF assertion fails.
        await outgoing.status.catch(() => undefined)
        await server.close()
      }
    })

    it('returns immediate 413 for actual overflow even if the route catches its read error', async () => {
      const server = await serverWith(undefined, listener)
      const caught = vi.fn()
      server.app.post('/upload', async (c) => {
        try {
          await c.req.arrayBuffer()
        } catch {
          caught()
        }
        return c.text('Route swallowed the error')
      })
      const outgoing = openRequest(server)
      try {
        outgoing.request.write('x'.repeat(33))
        expect(await outgoing.status).toBe(413)
        expect(caught).toHaveBeenCalledOnce()
      } finally {
        outgoing.request.destroy()
        await server.close()
      }
    })

    it('forwards native disconnect to a pending read and the request signal', async () => {
      const server = await serverWith(undefined, listener)
      const consumed = vi.fn()
      const cleaned = vi.fn()
      server.app.post('/upload', async (c) => {
        const reader = c.req.raw.body?.getReader()
        try {
          if (!reader) throw new Error('Missing body')
          while (!(await reader.read()).done) consumed()
        } catch {
          // Native disconnect is expected; cleanup must still execute.
        } finally {
          cleaned(c.req.raw.signal.aborted)
        }
        return c.text('Ended')
      })
      const outgoing = openRequest(server)
      void outgoing.status.catch(() => undefined)
      try {
        outgoing.request.write('x')
        await expect.poll(() => consumed.mock.calls.length).toBe(1)
        outgoing.request.destroy()
        await expect.poll(() => cleaned.mock.calls).toEqual([[true]])
      } finally {
        outgoing.request.destroy()
        await server.close()
      }
    })
  },
)

describe('streaming demand and cancellation', () => {
  it('keeps native observer input bounded while a consumer pauses', async () => {
    const bytes = 4 * 1024 * 1024
    let observed = 0
    const observer: RequestListener = (request) => {
      request.on('data', (chunk: Buffer) => {
        observed += chunk.byteLength
      })
    }
    const server = await serverWith(
      [{ ...STREAMING_RULE, maxSize: bytes }],
      observer,
      bytes,
    )
    const started = vi.fn()
    const finished = vi.fn()
    let resume: (() => void) | undefined
    const pause = new Promise<void>((resolve) => {
      resume = resolve
    })
    server.app.post('/upload', async (c) => {
      const reader = c.req.raw.body?.getReader()
      if (!reader) return c.text('Missing body', 400)
      let size = (await reader.read()).value?.byteLength ?? 0
      started()
      await pause
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
      }
      finished(size)
      return c.text(String(size))
    })
    const outgoing = openRequest(server)
    void outgoing.status.catch(() => undefined)
    try {
      outgoing.request.end(Buffer.alloc(bytes, 17))
      await expect.poll(() => started.mock.calls.length).toBe(1)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(observed).toBeGreaterThan(0)
      expect(observed).toBeLessThan(1024 * 1024)
      resume?.()
      expect(await outgoing.status).toBe(200)
      expect(finished).toHaveBeenCalledWith(bytes)
    } finally {
      resume?.()
      outgoing.request.destroy()
      await server.close()
    }
  })

  it('pulls only on demand and forwards consumer cancellation', async () => {
    const server = await serverWith()
    const pulled = vi.fn()
    const cancelled = vi.fn()
    const input = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled()
          controller.enqueue(Uint8Array.of(7))
        },
        cancel: cancelled,
      },
      { highWaterMark: 0 },
    )
    server.app.post('/upload', async (c) => {
      expect(pulled).not.toHaveBeenCalled()
      const reader = c.req.raw.body?.getReader()
      if (!reader) return c.text('Missing body', 400)
      expect((await reader.read()).value).toEqual(Uint8Array.of(7))
      expect(pulled).toHaveBeenCalledOnce()
      await reader.cancel('Upload cancelled')
      return c.text('Cancelled', 408)
    })
    try {
      const options = { method: 'POST', body: input, duplex: 'half' } as const
      const response = await server.app.request(
        `http://${HOST}/upload`,
        options,
      )
      expect(response.status).toBe(408)
      expect(cancelled).toHaveBeenCalledWith('Upload cancelled')
      expect(pulled).toHaveBeenCalledOnce()
    } finally {
      await server.close()
    }
  })
})

describe('streaming route policy compatibility', () => {
  it('keeps buffered defaults, prefix siblings, malformed encodings and buffered overlaps', async () => {
    const server = await serverWith([
      STREAMING_RULE,
      { pathPrefix: '/upload/private', maxSize: 16 },
    ])
    const handler = vi.fn()
    server.app.post('*', async (c) => {
      handler()
      await c.req.arrayBuffer()
      return c.text('Bounded')
    })
    try {
      for (const path of ['/upload/private', '/uploader', '/upload/%ZZ']) {
        const outgoing = openRequest(server, path)
        try {
          outgoing.request.write('x')
          await new Promise((resolve) => setTimeout(resolve, 30))
          expect(handler).not.toHaveBeenCalled()
          outgoing.request.end()
          expect(await outgoing.status).toBe(200)
          expect(handler).toHaveBeenCalledOnce()
          handler.mockClear()
        } finally {
          outgoing.request.destroy()
        }
      }
      for (const path of ['/upload', '/%75pload/image']) {
        const outgoing = openRequest(server, path)
        try {
          outgoing.request.end('x'.repeat(33))
          expect(await outgoing.status).toBe(413)
        } finally {
          outgoing.request.destroy()
        }
      }
    } finally {
      await server.close()
    }
  })

  it('rejects known Content-Length overflow before invoking a streaming route', async () => {
    const server = await serverWith()
    const handler = vi.fn()
    server.app.post('/upload', (c) => {
      handler()
      return c.text('Should not run')
    })
    const outgoing = openRequest(server, '/upload', { 'content-length': '33' })
    try {
      outgoing.request.end('x'.repeat(33))
      expect(await outgoing.status).toBe(413)
      expect(handler).not.toHaveBeenCalled()
    } finally {
      outgoing.request.destroy()
      await server.close()
    }
  })

  it('never lets a streaming rule increase the global cap', async () => {
    const server = await serverWith([{ ...STREAMING_RULE, maxSize: 128 }])
    server.app.post('/upload', async (c) => {
      await c.req.arrayBuffer()
      return c.text('Bounded')
    })
    const outgoing = openRequest(server)
    try {
      outgoing.request.end('x'.repeat(65))
      expect(await outgoing.status).toBe(413)
    } finally {
      outgoing.request.destroy()
      await server.close()
    }
  })

  it('rejects invalid modes before starting the HTTP listener', async () => {
    const rule = { ...STREAMING_RULE }
    Reflect.set(rule, 'bodyMode', 'unsafe')
    let server: Server | undefined
    try {
      expect(() => {
        server = new Server({
          globalInstance: false,
          port: 0,
          requestBodySizeLimits: [rule],
        })
      }).toThrow('body mode')
    } finally {
      await server?.close()
    }
  })
})
