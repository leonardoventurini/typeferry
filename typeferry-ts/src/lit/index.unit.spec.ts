// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import * as lit from './index'

describe('lit public index', () => {
  it('re-exports the expected controllers and helpers', () => {
    expect(lit.TypeFerryClientController).toBeTruthy()
    expect(lit.TypeFerryAuthController).toBeTruthy()
    expect(lit.TypeFerryConnectionController).toBeTruthy()
    expect(lit.TypeFerryLocalEventController).toBeTruthy()
    expect(lit.TypeFerrySubscribeController).toBeTruthy()
    expect(lit.TypeFerryMethodController).toBeTruthy()
    expect(lit.TypeFerryTokenRefreshController).toBeTruthy()
    expect(lit.resolveClient).toBeTruthy()
  })
})
