import { createMessagesMigration } from '@/server/migrations/001-create-messages'
import { executeMigrations } from '@/server/migrations/runner'
import type { Migration } from '@/server/migrations/types'

export const migrations: readonly Migration[] = [createMessagesMigration]

/** Applies every pending migration once while holding a database-backed lease. */
export async function runMigrations(): Promise<void> {
  await executeMigrations(migrations)
}
