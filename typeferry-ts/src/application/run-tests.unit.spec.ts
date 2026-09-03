import { afterEach, describe, expect, it, vi } from 'vitest'

import { prepareTestEnvironment } from './run-tests'

describe('application test environment', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses the conventional test environment when none is configured', () => {
    vi.stubEnv('NODE_ENV', '')

    prepareTestEnvironment()

    expect(process.env['NODE_ENV']).toBe('test')
  })

  it('preserves an explicitly configured environment', () => {
    vi.stubEnv('NODE_ENV', 'custom-test')

    prepareTestEnvironment()

    expect(process.env['NODE_ENV']).toBe('custom-test')
  })
})
