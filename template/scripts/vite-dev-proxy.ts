import {
  type IncomingMessage,
  request as createHttpRequest,
  type ServerResponse,
} from 'node:http'

import type { Plugin } from 'vite'

const BACKEND_PORT = 8002

export function isBifrostHttpPath(url: string | undefined): boolean {
  return url === '/__h' || url?.startsWith('/__h/') === true
}

export function bifrostDevProxy(): Plugin {
  return {
    name: 'bifrost-development-proxy',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!isBifrostHttpPath(request.url)) {
          next()
          return
        }

        proxyRequest(request, response)
      })
    },
  }
}

function proxyRequest(
  clientRequest: IncomingMessage,
  clientResponse: ServerResponse,
): void {
  const proxyRequest = createHttpRequest(
    {
      hostname: '127.0.0.1',
      port: BACKEND_PORT,
      method: clientRequest.method,
      path: clientRequest.url,
      headers: {
        ...clientRequest.headers,
        host: `localhost:${BACKEND_PORT}`,
      },
    },
    proxyResponse => {
      clientResponse.writeHead(proxyResponse.statusCode ?? 502, {
        ...proxyResponse.headers,
        'set-cookie': proxyResponse.headers['set-cookie']?.map(cookie =>
          cookie.replace(/;\s*Domain=[^;]+/giu, ''),
        ),
      })
      proxyResponse.pipe(clientResponse)
    },
  )

  proxyRequest.on('error', (error: Error) => {
    if (!clientResponse.headersSent) {
      clientResponse.writeHead(502, { 'content-type': 'text/plain' })
    }
    clientResponse.end(`Bifrost development proxy error: ${error.message}`)
  })
  clientRequest.on('aborted', () => proxyRequest.destroy())
  clientRequest.pipe(proxyRequest)
}
