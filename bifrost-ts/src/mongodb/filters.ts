import type { Document, ObjectId, UpdateFilter } from 'mongodb'

import { toObjectId } from './schema'

/** Contract for documents that use the explicit soft-delete helpers. */
export interface SoftDeleted extends Document {
  /** Deletion timestamp, or `null` while active. */
  deletedAt?: Date | null
  /** User id that deleted the document, when available. */
  deletedBy?: ObjectId | null
}

/** Adds an explicit active-document predicate to a native MongoDB filter. */
export function active<TFilter extends Document>(
  filter: TFilter = {} as TFilter,
): TFilter & { deletedAt: null } {
  if (Object.prototype.hasOwnProperty.call(filter, 'deletedAt')) {
    throw new Error('active() cannot override an explicit deletedAt filter.')
  }
  return {
    ...filter,
    deletedAt: null,
  }
}

/** Builds a native update that marks a document as soft-deleted. */
export function markDeleted(
  deletedBy: string | ObjectId,
  options: { readonly now?: Date } = {},
): UpdateFilter<SoftDeleted> {
  return {
    $set: {
      deletedAt: options.now ?? new Date(),
      deletedBy: toObjectId(deletedBy),
    },
  }
}

/** Builds a native update that removes soft-delete markers. */
export function markRestored(): UpdateFilter<SoftDeleted> {
  return {
    $unset: {
      deletedAt: '',
      deletedBy: '',
    },
  } as UpdateFilter<SoftDeleted>
}

/** Converts a whitespace-delimited projection string into a driver projection document. */
export function projection(fields: string): Document {
  return fields
    .split(/\s+/)
    .filter(Boolean)
    .reduce<Document>((projected, field) => {
      projected[field] = 1
      return projected
    }, {})
}
