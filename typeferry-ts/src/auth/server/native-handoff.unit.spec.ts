import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { NativeAuthHandoff, type NativeAuthGrant, type NativeAuthGrantStore } from './native-handoff'

function fixture() {
  const grants = new Map<string, NativeAuthGrant<string>>()
  const store: NativeAuthGrantStore<string> = {
    async create(grant) { grants.set(grant.codeHash, grant) },
    async consume(request) {
      const grant = grants.get(request.codeHash)

      if (!grant || grant.challenge !== request.challenge || grant.redirectUri !== request.redirectUri || grant.expiresAt <= request.now) return null

      grants.delete(request.codeHash)

      return grant.value
    },
  }
  let now = 1_000
  const redirectUri = 'com.example.app://auth/callback'
  const handoff = new NativeAuthHandoff({ store, redirectUris: [redirectUri], now: () => now })
  const verifier = Buffer.alloc(32, 7).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')

  return { handoff, verifier, challenge, redirectUri, grants, expire: () => { now += 120_001 } }
}

describe('native auth handoff', () => {
  it('stores only a code hash and atomically exchanges the matching PKCE grant once', async () => {
    const { handoff, verifier, challenge, redirectUri, grants } = fixture()
    const callback = await handoff.authorize({ value: 'user-id', challenge, redirectUri, state: 'state' })
    const code = new URL(callback).searchParams.get('code') ?? ''

    expect(code.length).toBe(43)
    expect([...grants.keys()]).not.toContain(code)
    expect(new URL(callback).searchParams.get('state')).toBe('state')
    const exchange = { code, verifier, redirectUri }

    expect(await handoff.exchange(exchange)).toBe('user-id')
    await expect(handoff.exchange(exchange)).rejects.toThrow('Invalid or expired native authorization code')
  })

  it('rejects a wrong verifier without consuming the valid grant', async () => {
    const { handoff, verifier, challenge, redirectUri } = fixture()
    const callback = await handoff.authorize({ value: 'user-id', challenge, redirectUri, state: 'state' })
    const code = new URL(callback).searchParams.get('code') ?? ''

    await expect(handoff.exchange({ code, verifier: Buffer.alloc(32, 9).toString('base64url'), redirectUri })).rejects.toThrow('Invalid or expired')
    expect(await handoff.exchange({ code, verifier, redirectUri })).toBe('user-id')
  })

  it('rejects expiration and unregistered redirect URIs', async () => {
    const { handoff, verifier, challenge, redirectUri, expire } = fixture()
    await expect(handoff.authorize({ value: 'user-id', challenge, redirectUri: 'com.attacker://auth/callback', state: 'state' })).rejects.toThrow('Unregistered native redirect URI')
    const callback = await handoff.authorize({ value: 'user-id', challenge, redirectUri, state: 'state' })

    expire()

    await expect(handoff.exchange({ code: new URL(callback).searchParams.get('code') ?? '', verifier, redirectUri })).rejects.toThrow('Invalid or expired')
  })

  it('rejects missing or malformed PKCE before issuing a code', async () => {
    const { handoff, redirectUri, grants } = fixture()

    await expect(handoff.authorize({ value: 'user-id', challenge: 'plain', redirectUri, state: 'state' })).rejects.toThrow('Invalid native authorization challenge')
    expect(grants.size).toBe(0)
  })
})
