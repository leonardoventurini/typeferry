// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import * as lit from './index'

describe('lit public index', () => {
  it('re-exports the expected controllers and helpers', () => {
    expect(lit.BifrostClientController).toBeTruthy()
    expect(lit.BifrostAuthController).toBeTruthy()
    expect(lit.BifrostConnectionController).toBeTruthy()
    expect(lit.BifrostLocalEventController).toBeTruthy()
    expect(lit.BifrostSubscribeController).toBeTruthy()
    expect(lit.BifrostMethodController).toBeTruthy()
    expect(lit.BifrostTokenRefreshController).toBeTruthy()
    expect(lit.resolveClient).toBeTruthy()
  })
})
