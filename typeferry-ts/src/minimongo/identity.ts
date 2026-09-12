import type { MinimongoId } from './types'

export interface IdentityCodec<TId = unknown> {
  stringify(id: TId): string
  parse(value: string): TId
}

/** Identity codec for TypeFerry's client-safe string IDs. */
export const stringIdentityCodec: IdentityCodec<MinimongoId> = {
  stringify(id): string {
    return id
  },
  parse(value: string): MinimongoId {
    return value
  },
}

export function assertLocalId(value: unknown): asserts value is MinimongoId {
  if (typeof value === 'string' && /^[0-9a-f]{24}$/.test(value)) return

  throw new TypeError('Local collection _id must be a lowercase 24-character hexadecimal string.')
}
