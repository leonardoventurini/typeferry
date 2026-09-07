import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export interface NativeHTTPRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export interface NativeHTTPResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

export interface NativeAppState {
  isActive: boolean
}

/**
 * Optional iOS bridge. Import only from native application entry points.
 * Origins and callback schemes are pinned by generated native configuration;
 * JavaScript cannot expand the native trust boundary.
 */
export interface TypeFerryNativePlugin {
  request(options: NativeHTTPRequest): Promise<NativeHTTPResponse>
  getSession(): Promise<{ value: string | null }>
  setSession(options: { value: string }): Promise<void>
  clearSession(): Promise<void>
  authenticate(options: { url: string; callbackScheme: string }): Promise<{ url: string }>
  acquireWakeLock(): Promise<{ id: string }>
  releaseWakeLock(options: { id: string }): Promise<void>
  getState(): Promise<NativeAppState>
  addListener(eventName: 'appStateChange', listener: (state: NativeAppState) => void): Promise<PluginListenerHandle>
  beginFile(options: { fileName: string; size: number }): Promise<{ id: string }>
  appendFile(options: { id: string; offset: number; base64: string }): Promise<void>
  finishFile(options: { id: string }): Promise<{ completed: boolean }>
  cancelFile(options: { id: string }): Promise<void>
  shareFile(options: { url: string; fileName: string; headers?: Record<string, string> }): Promise<{ completed: boolean }>
}

export const TypeFerryNative = registerPlugin<TypeFerryNativePlugin>('TypeFerryNative')

export { NATIVE_FILE_CHUNK_BYTES, NATIVE_FILE_MAX_BYTES, shareNativeFile } from './share-file'
export type { ShareNativeFileOptions } from './share-file'

export { acquireNativeWakeLock } from './wake-lock'
export type { NativeWakeLock } from './wake-lock'
