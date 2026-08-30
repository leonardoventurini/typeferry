import { randomUUID } from 'node:crypto'

import type { Collection, WithId } from 'mongodb'

import { getDatabase } from '@/server/data/database'
import { logger } from '@/server/logging/logger'
import type { Migration } from '@/server/migrations/types'

interface MigrationState {
  _id: 'application'
  appliedVersions: number[]
  lockOwner?: string
  lockedUntil?: Date
}

const LOCK_DURATION_MS = 5 * 60 * 1_000

/** Rejects unordered or duplicate migrations before database state is touched. */
export function assertMigrationList(entries: readonly Migration[]): void {
  let previousVersion = 0
  for (const entry of entries) {
    if (
      !Number.isSafeInteger(entry.version) ||
      entry.version <= previousVersion
    ) {
      throw new Error(
        'Migrations must have unique, positive versions in ascending order.',
      )
    }
    previousVersion = entry.version
  }
}

async function acquireLock(
  collection: Collection<MigrationState>,
  owner: string,
): Promise<WithId<MigrationState>> {
  await collection.updateOne(
    { _id: 'application' },
    { $setOnInsert: { appliedVersions: [] } },
    { upsert: true },
  )

  const now = new Date()
  const state = await collection.findOneAndUpdate(
    {
      _id: 'application',
      $or: [
        { lockedUntil: { $exists: false } },
        { lockedUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        lockOwner: owner,
        lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS),
      },
    },
    { returnDocument: 'after' },
  )

  if (!state) throw new Error('Database migrations are already running.')
  return state
}

async function releaseLock(
  collection: Collection<MigrationState>,
  owner: string,
): Promise<void> {
  await collection.updateOne(
    { _id: 'application', lockOwner: owner },
    { $unset: { lockOwner: '', lockedUntil: '' } },
  )
}

/** Executes an ordered migration set while holding a database-backed lease. */
export async function executeMigrations(
  entries: readonly Migration[],
): Promise<void> {
  assertMigrationList(entries)
  const database = getDatabase()
  const collection = database.collection<MigrationState>('migration-state')
  const owner = randomUUID()
  const state = await acquireLock(collection, owner)

  try {
    const appliedVersions = new Set(state.appliedVersions)
    for (const migration of entries) {
      if (appliedVersions.has(migration.version)) continue

      logger.info(
        {
          migration: migration.name,
          version: migration.version,
        },
        'Running database migration',
      )
      await migration.up(database)
      const result = await collection.updateOne(
        { _id: 'application', lockOwner: owner },
        { $addToSet: { appliedVersions: migration.version } },
      )
      if (result.matchedCount !== 1) {
        throw new Error('Database migration lock ownership was lost.')
      }
    }
  } finally {
    await releaseLock(collection, owner)
  }
}
