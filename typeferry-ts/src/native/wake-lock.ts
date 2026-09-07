import { TypeFerryNative } from './index'

export interface NativeWakeLock {
  release(): Promise<void>
}

/**
 * Keeps the screen awake while the owning native application is foregrounded.
 * Release on presentation exit/unmount. A late acquisition must also be released
 * if its component was disposed while the native promise was pending.
 */
export async function acquireNativeWakeLock(): Promise<NativeWakeLock> {
  const { id } = await TypeFerryNative.acquireWakeLock()
  let release: Promise<void> | undefined

  return {
    release(): Promise<void> {
      release ??= TypeFerryNative.releaseWakeLock({ id })
      return release
    },
  }
}
