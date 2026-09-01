import type { ClientOptions } from 'typeferry/client'

const configuredPort = import.meta.env['VITE_SERVER_PORT']
const serverPort = Number(
  configuredPort ??
    (import.meta.env.DEV
      ? 8002
      : window.location.port ||
        (window.location.protocol === 'https:' ? 443 : 80)),
)

export const typeferryClientOptions: ClientOptions = {
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
