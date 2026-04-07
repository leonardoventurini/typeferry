// Types
export type {
  AccessTokenPayload,
  AuthConfig,
  AuthContext,
  CookieOptions,
  CrossTabSyncConfig,
  DeviceInfo,
  Session,
  SessionManager,
  TokenPair,
  TokenRefreshConfig,
} from './types'

// Server utilities
export {
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from './server/cookie-utils'
export { parseDeviceInfo } from './server/device-info'
export {
  decodeToken,
  signAccessToken,
  verifyAccessToken,
} from './server/jwt-utils'
export { InMemorySessionManager } from './server/session-manager'

// Client utilities
export {
  broadcastTokenRefresh,
  setupCrossTabSync,
} from './client/cross-tab-sync'
export {
  refreshAccessToken,
  setupTokenRefreshOnExpiry,
} from './client/token-refresh'
