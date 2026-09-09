import { looksLikeObjectID, ObjectID } from './object-id'
import type { MinimongoId } from './types'

export interface IdentityCodec<TId = unknown> {
  stringify(id: TId): string
  parse(value: string): TId
}

/** Meteor's collision-proof scalar and ObjectID identity encoding. */
export const meteorIdentityCodec: IdentityCodec<unknown> = {
  stringify(id: unknown): string {
    if (id instanceof ObjectID) return id.valueOf()
    if (typeof id === 'string') {
      if (id === '') return id
      if (['-', '~', '{'].includes(id[0] ?? '') || looksLikeObjectID(id)) return `-${id}`

      return id
    }
    if (id === undefined) return '-'
    if (typeof id === 'object' && id !== null) {
      throw new Error('Meteor does not currently support objects other than ObjectID as ids')
    }

    return `~${JSON.stringify(id)}`
  },
  parse(value: string): unknown {
    if (value === '') return value
    if (value === '-') return undefined
    if (value.startsWith('-')) return value.slice(1)
    if (value.startsWith('~')) return JSON.parse(value.slice(1)) as unknown
    if (looksLikeObjectID(value)) return new ObjectID(value)

    return value
  },
}

export function assertMinimongoId(value: unknown): asserts value is MinimongoId {
  if (typeof value === 'string' || typeof value === 'number' || value instanceof ObjectID) return

  throw new Error('Meteor requires document _id fields to be non-empty strings, numbers, or ObjectIDs')
}

