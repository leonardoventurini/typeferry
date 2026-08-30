import { describe, expect, it } from 'vitest'

import { assertMigrationList } from '@/server/migrations/runner'
import type { Migration } from '@/server/migrations/types'

function migration(version: number): Migration {
  return {
    name: `migration-${version}`,
    version,
    async up(): Promise<void> {
      await Promise.resolve()
    },
  }
}

describe('assertMigrationList', () => {
  it('accepts positive migrations in ascending order', () => {
    expect(() =>
      assertMigrationList([migration(1), migration(2)]),
    ).not.toThrow()
  })

  it('rejects duplicate, unordered, and non-positive versions', () => {
    expect(() => assertMigrationList([migration(1), migration(1)])).toThrow()
    expect(() => assertMigrationList([migration(2), migration(1)])).toThrow()
    expect(() => assertMigrationList([migration(0)])).toThrow()
  })
})
