import type { Document } from 'mongodb'

/** Options for timestamp helpers that need deterministic clocks in tests. */
export interface TimestampOptions {
  /** Timestamp to apply instead of `new Date()`. */
  readonly now?: Date
}

/** Document fields added by insert timestamp helpers. */
export interface InsertTimestamps {
  /** Creation timestamp. */
  readonly createdAt: Date
  /** Last update timestamp. */
  readonly updatedAt: Date
}

/** Adds `createdAt` and `updatedAt` to a document before insertion. */
export function withInsertTimestamps<TInput extends Document>(
  input: TInput,
  options: TimestampOptions = {},
): TInput & InsertTimestamps {
  const now = options.now ?? new Date()
  return {
    ...input,
    createdAt: now,
    updatedAt: now,
  }
}

/** Adds `updatedAt` to a native MongoDB update document without changing other operators. */
export function withUpdateTimestamp<TUpdate extends Document>(
  update: TUpdate,
  options: TimestampOptions = {},
): TUpdate {
  const now = options.now ?? new Date()
  const setOperator = readObjectRecord(update.$set)

  return {
    ...update,
    $set: {
      ...setOperator,
      updatedAt: now,
    },
  } as TUpdate
}

function readObjectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}
