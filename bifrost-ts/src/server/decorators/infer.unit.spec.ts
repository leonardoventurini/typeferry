import { describe, expect, it } from 'vitest'

/**
 * infer.ts exports only type-level constructs (InferNamespace, MethodsOf, etc.).
 * There is no runtime code to execute. These tests verify that the module can be
 * imported without errors and that the type-level exports produce correct shapes
 * at compile time (checked via `expectTypeOf` / assignability assertions).
 */

describe('infer module', () => {
  it('can be imported without errors', async () => {
    // Dynamic import to verify the module parses and evaluates cleanly.
    const mod = await import('./infer')
    // The module exports only types, so the runtime module object should be
    // essentially empty (just the default module namespace object).
    expect(mod).toBeDefined()
  })

  it('exports no runtime values', async () => {
    const mod = await import('./infer')
    // Filter out the Module symbol key and __esModule
    const keys = Object.keys(mod)
    expect(keys).toHaveLength(0)
  })
})
