/**
 * Public, non-secret build metadata. Browser builds retain same-origin behavior;
 * native builds embed only the explicitly configured backend origin.
 */
export interface ApplicationRuntime {
  readonly target: 'web' | 'ios'
  readonly backendOrigin?: string
}

declare const __TYPEFERRY_RUNTIME__: ApplicationRuntime | undefined

export function getApplicationRuntime(): ApplicationRuntime {
  return typeof __TYPEFERRY_RUNTIME__ === 'undefined'
    ? { target: 'web' }
    : __TYPEFERRY_RUNTIME__
}

/**
 * Resolves backend-owned paths without rewriting external provider URLs.
 */
export function resolveBackendUrl(path: string): string {
  const { backendOrigin } = getApplicationRuntime()
  if (!backendOrigin || !path.startsWith('/') || path.startsWith('//')) return path
  return new URL(path, backendOrigin).href
}
