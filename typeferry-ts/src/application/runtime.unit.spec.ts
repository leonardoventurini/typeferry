import { afterEach, expect, it, vi } from 'vitest'

import { getApplicationRuntime, resolveBackendUrl } from './runtime'

afterEach(() => vi.unstubAllGlobals())

it('preserves browser paths without a native target', () => {
  expect(getApplicationRuntime()).toEqual({ target: 'web' })
  expect(resolveBackendUrl('/api/upload')).toBe('/api/upload')
})

it('resolves backend paths without capturing external providers', () => {
  vi.stubGlobal('__TYPEFERRY_RUNTIME__', { target: 'ios', backendOrigin: 'https://example.com' })
  expect(resolveBackendUrl('/api/upload?q=1')).toBe('https://example.com/api/upload?q=1')
  expect(resolveBackendUrl('https://provider.test/file')).toBe('https://provider.test/file')
  expect(resolveBackendUrl('//provider.test/file')).toBe('//provider.test/file')
})
