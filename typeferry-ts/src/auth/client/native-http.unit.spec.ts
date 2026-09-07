import { describe, expect, it, vi } from 'vitest'

import { createNativeHttpFetch } from './native-http'

function fixture(status = 200, body = 'response') {
  const request = vi.fn().mockResolvedValue({ status, statusText: 'OK', headers: { 'content-type': 'text/plain' }, body })

  return { request, httpFetch: createNativeHttpFetch({ request }) }
}

describe('native HTTP adapter', () => {
  it('normalizes headers and passes textual RPC bodies through the native bridge', async () => {
    const { request, httpFetch } = fixture()
    const response = await httpFetch('https://example.test/__h', { method: 'POST', headers: new Headers({ 'x-api-key': 'access' }), body: 'rpc', credentials: 'include' })

    expect(request).toHaveBeenCalledWith({ url: 'https://example.test/__h', method: 'POST', headers: { 'x-api-key': 'access' }, body: 'rpc' })
    expect(await response.text()).toBe('response')
    expect(response.headers.get('content-type')).toBe('text/plain')
  })

  it('supports bodyless responses', async () => {
    const { httpFetch } = fixture(204, '')

    expect((await httpFetch('https://example.test/empty')).status).toBe(204)
  })

  it('fails explicitly for binary bodies without calling native request', async () => {
    const { request, httpFetch } = fixture()

    await expect(httpFetch('https://example.test/upload', { body: new Uint8Array(8) })).rejects.toThrow('Native HTTP adapter supports text request bodies only')
    expect(request).not.toHaveBeenCalled()
  })

  it('honors an already-aborted operation before reaching the bridge', async () => {
    const { request, httpFetch } = fixture()

    await expect(httpFetch('https://example.test/__h', { signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' })
    expect(request).not.toHaveBeenCalled()
  })
})
