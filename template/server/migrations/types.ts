import type { Db } from 'mongodb'

/** One immutable, ordered database transition. */
export interface Migration {
  readonly version: number
  readonly name: string
  readonly up: (database: Db) => Promise<void>
}
