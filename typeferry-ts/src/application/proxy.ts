import {
  type IncomingHttpHeaders,
  type IncomingMessage,
  request as createHttpRequest,
  type ServerResponse,
} from 'node:http'

import type { Plugin } from 'vite'

export function isTypeFerryHttpPath(url: string | undefined): boolean {
  return url === '/__h' || url?.startsWith('/__h/') === true
}

export function createTypeFerryDevProxy(backendPort: number): Plugin {
  return {
    name: 'typeferry-development-proxy',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!isTypeFerryHttpPath(request.url)) {
          next()
          return
        }

        proxyRequest(request, response, backendPort)
      })
    },
  }
}

/** Removes backend-only cookie domains without adding undefined headers. */
export function rewriteProxyHeaders(
  proxyHeaders: IncomingHttpHeaders,
): IncomingHttpHeaders {
  const headers = { ...proxyHeaders }
  const setCookie = headers['set-cookie']
  if (setCookie) {
    headers['set-cookie'] = setCookie.map(cookie =>
      cookie.replace(/;\s*Domain=[^;]+/giu, ''),
    )
  }
  return headers
}

function proxyRequest(
  clientRequest: IncomingMessage,
  clientResponse: ServerResponse,
  backendPort: number,
): void {
  const proxyRequest = createHttpRequest(
    {
      hostname: '127.0.0.1',
      port: backendPort,
      method: clientRequest.method,
      path: clientRequest.url,
      headers: {
        ...clientRequest.headers,
        host: `localhost:${backendPort}`,
      },
    },
    proxyResponse => {
      clientResponse.writeHead(
        proxyResponse.statusCode ?? 502,
        rewriteProxyHeaders(proxyResponse.headers),
      )
      proxyResponse.pipe(clientResponse)
    },
  )

  proxyRequest.on('error', (error: Error) => {
    if (!clientResponse.headersSent) {
      clientResponse.writeHead(502, { 'content-type': 'text/plain' })
    }
    clientResponse.end(`TypeFerry development proxy error: ${error.message}`)
  })
  clientRequest.on('aborted', () => proxyRequest.destroy())
  clientRequest.pipe(proxyRequest)
}
