/**
 * Replay every HTTP fixture against the TS server.
 *
 * Boots the server on a random port via TestUtility, registers the
 * methods/auth described in each fixture, POSTs the fixture body,
 * and compares the decoded response.
 */

import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { Presentation } from '../../utils'
import { TestUtility } from '../test-utility'

const HTTP_ENDPOINT_PATH = '/__h'
import type { Server } from '../../server'
import type { ClientNode } from '../../server'

import { buildHandler, buildSchema, listCases, loadJson } from './harness'

function configureServer(server: Server, setup: any): void {
  if (!setup) return
  for (const spec of setup.methods ?? []) {
    const handler = buildHandler(spec.handler)
    const schema = buildSchema(spec.schema)
    const opts: any = {
      protected: !!spec.protected,
    }
    if (schema) opts.schema = schema
    server.addMethod(spec.name, handler as any, opts)
  }
  if (setup.auth) {
    const { accept_token: accept, user } = setup.auth
    server.setAuth({
      auth: async function (this: ClientNode, context: any) {
        if (context?.token === accept) return { user }
        return false
      },
      logIn: async () => true,
    })
  }
}

describe('HTTP conformance fixtures', () => {
  const utility = new TestUtility({ debug: false })

  for (const casePath of listCases('http')) {
    const name = path.basename(casePath, '.case.json')
    it(`${name}`, async () => {
      const fixture = loadJson(casePath)
      configureServer(utility.server, fixture.setup ?? {})

      const response = await fetch(
        `http://${utility.address}${HTTP_ENDPOINT_PATH}`,
        {
          method: 'POST',
          headers: fixture.request.headers,
          body: fixture.request.body,
        },
      )

      expect(response.status).toBe(fixture.response.status)

      const text = await response.text()
      if ('body' in fixture.response) {
        expect(text).toEqual(fixture.response.body)
      } else if ('decoded' in fixture.response) {
        const actual = Presentation.decode(text) as Record<string, unknown>
        // Strip server-generated correlation fields (if any) before comparing.
        expect(actual).toEqual(fixture.response.decoded)
      }
    })
  }
})
