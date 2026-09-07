import { BRIDGE_VIEW_CONTROLLER_SWIFT } from './bridge-view-controller'
import { FILE_STAGING_SWIFT } from './file-staging'
import { HTTP_SESSION_SWIFT } from './http-session'
import { KEYCHAIN_SWIFT } from './keychain'
import { MEDIA_PERMISSION_POLICY_SWIFT } from './media-permission-policy'
import { NATIVE_PLUGIN_SWIFT } from './plugin'
import { WAKE_LOCKS_SWIFT } from './wake-locks'

/**
 * Framework-owned Swift source files installed explicitly by the iOS scaffold.
 */
export const IOS_NATIVE_TEMPLATES: Readonly<Record<string, string>> = {
  'TypeFerryBridgeViewController.swift': BRIDGE_VIEW_CONTROLLER_SWIFT,
  'TypeFerryMediaPolicy.swift': MEDIA_PERMISSION_POLICY_SWIFT,
  'TypeFerryWakeLocks.swift': WAKE_LOCKS_SWIFT,
  'TypeFerryFileStaging.swift': FILE_STAGING_SWIFT,
  'TypeFerryKeychain.swift': KEYCHAIN_SWIFT,
  'TypeFerryHTTPSession.swift': HTTP_SESSION_SWIFT,
  'TypeFerryNativePlugin.swift': NATIVE_PLUGIN_SWIFT,
}
