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
  getState(): Promise<NativeAppState>
  addListener(eventName: 'appStateChange', listener: (state: NativeAppState) => void): Promise<PluginListenerHandle>
  shareFile(options: { url: string; fileName: string; headers?: Record<string, string> }): Promise<{ completed: boolean }>
}

export const TypeFerryNative = registerPlugin<TypeFerryNativePlugin>('TypeFerryNative')
