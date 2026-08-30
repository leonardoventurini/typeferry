import type { ClientOptions } from '@example-app/bifrost/client'

const serverPort = Number(import.meta.env['VITE_SERVER_PORT'] ?? 8002)

export const bifrostClientOptions: ClientOptions = {
  host: window.location.hostname,
  port: serverPort,
  secure: window.location.protocol === 'https:',
  allowedContextKeys: ['token'],
  initialContext: {
    token:
      import.meta.env['VITE_SAMPLE_AUTH_TOKEN'] ??
      'change-me-development-token',
  },
}
