import { UAParser } from 'ua-parser-js'

import type { DeviceInfo } from '../types'

/**
 * Request-like object for extracting device information.
 */
interface RequestLike {
  headers?: {
    'user-agent'?: string
    'x-forwarded-for'?: string
  }
  socket?: { remoteAddress?: string }
  ip?: string
}

/**
 * Parse device information from an HTTP request.
 * Extracts IP address, user agent, browser, OS, and device type.
 *
 * @param req - Request object with headers and socket info
 * @returns Parsed device information
 */
export function parseDeviceInfo(req: RequestLike): DeviceInfo {
  if (!req) {
    return {}
  }

  const uaString = req.headers?.['user-agent']
  const ip = getIpFromRequest(req)

  if (!uaString) {
    return { ip }
  }

  const parser = new UAParser(uaString)
  const result = parser.getResult()

  return {
    ip,
    userAgent: uaString,
    browser: result.browser.name
      ? `${result.browser.name} ${result.browser.version || ''}`.trim()
      : undefined,
    os: result.os.name
      ? `${result.os.name} ${result.os.version || ''}`.trim()
      : undefined,
    deviceType: mapDeviceType(result.device.type),
  }
}

/**
 * Extract client IP address from request.
 * Checks x-forwarded-for header first (for proxied requests),
 * then falls back to socket address or express ip property.
 */
function getIpFromRequest(req: RequestLike): string | undefined {
  return req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || req.ip
}

/**
 * Map UA parser device type to our DeviceInfo type.
 */
function mapDeviceType(type?: string): DeviceInfo['deviceType'] {
  if (!type) return 'desktop'
  if (type === 'mobile') return 'mobile'
  if (type === 'tablet') return 'tablet'
  return 'unknown'
}
