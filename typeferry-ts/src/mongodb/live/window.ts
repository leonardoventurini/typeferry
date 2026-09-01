import { EJSON } from '../../ejson'
import {
  type MongoLiveClientDocument,
  type MongoLiveRuntimeWindow,
  type MongoLiveWindowInput,
  type MongoLiveWindowSpliceOperation,
} from './types'

/** Validates and normalizes one server-owned ordered window. */
export function normalizeMongoLiveWindow(
  window: MongoLiveWindowInput,
  maxDocuments: number,
  maxSkip: number,
): MongoLiveRuntimeWindow {
  const entries = Object.entries(window.sort)
  if (entries.length === 0) {
    throw new Error('MongoDB live ordered windows require at least one sort field.')
  }
  if (!Number.isSafeInteger(window.limit) || window.limit < 1) {
    throw new Error('MongoDB live ordered window "limit" must be a positive integer.')
  }
  if (window.limit > maxDocuments) {
    throw new Error(
      `MongoDB live ordered window "limit" exceeds ${maxDocuments} documents.`,
    )
  }

  const skip = window.skip ?? 0
  if (!Number.isSafeInteger(skip) || skip < 0) {
    throw new Error(
      'MongoDB live ordered window "skip" must be a non-negative integer.',
    )
  }
  if (skip > maxSkip) {
    throw new Error(
      `MongoDB live ordered window "skip" exceeds ${maxSkip} documents.`,
    )
  }

  const fields = new Set<string>()
  const sort: Array<readonly [string, 1 | -1]> = []
  for (const [field, direction] of entries) {
    if (
      typeof field !== 'string' ||
      field.length === 0 ||
      field === '_id' ||
      field.startsWith('$') ||
      field.includes('.')
    ) {
      throw new Error(
        'MongoDB live ordered window sort fields must be unique top-level fields other than "_id".',
      )
    }
    if (fields.has(field)) {
      throw new Error(`MongoDB live ordered window sort field "${field}" is duplicated.`)
    }
    if (direction !== 1 && direction !== -1) {
      throw new Error(
        `MongoDB live ordered window sort direction for "${field}" must be 1 or -1.`,
      )
    }
    fields.add(field)
    sort.push([field, direction])
  }
  sort.push(['_id', 1])

  return { sort, skip, limit: window.limit }
}

/** Derives one atomic splice between two authoritative ordered windows. */
export function createMongoLiveWindowSplice<
  TDocument extends MongoLiveClientDocument,
>(
  previous: readonly TDocument[],
  current: readonly TDocument[],
): MongoLiveWindowSpliceOperation<TDocument> | null {
  let prefix = 0
  while (
    prefix < previous.length &&
    prefix < current.length &&
    EJSON.equals(previous[prefix], current[prefix])
  ) {
    prefix += 1
  }
  if (prefix === previous.length && prefix === current.length) return null

  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < current.length - prefix &&
    EJSON.equals(
      previous[previous.length - 1 - suffix],
      current[current.length - 1 - suffix],
    )
  ) {
    suffix += 1
  }

  const operation: MongoLiveWindowSpliceOperation<TDocument> = {
    type: 'window-splice',
    index: prefix,
    deleteCount: previous.length - prefix - suffix,
    documents: current.slice(prefix, current.length - suffix),
  }
  const applied = applyMongoLiveWindowSplice(previous, operation)
  if (!applied || !EJSON.equals(applied, current)) {
    throw new Error('MongoDB live ordered window splice invariant failed.')
  }
  return operation
}

/** Applies one splice after validating indices and unique materialized identity. */
export function applyMongoLiveWindowSplice<
  TDocument extends MongoLiveClientDocument,
>(
  previous: readonly TDocument[],
  operation: MongoLiveWindowSpliceOperation<TDocument>,
): readonly TDocument[] | null {
  if (
    !Number.isSafeInteger(operation.index) ||
    !Number.isSafeInteger(operation.deleteCount) ||
    operation.index < 0 ||
    operation.deleteCount < 0 ||
    operation.index > previous.length ||
    operation.index + operation.deleteCount > previous.length
  ) {
    return null
  }

  const current = [...previous]
  current.splice(
    operation.index,
    operation.deleteCount,
    ...operation.documents,
  )
  const identities = new Set<string>()
  for (const document of current) {
    const identity = EJSON.stringify(document._id, { canonical: true })
    if (identities.has(identity)) return null
    identities.add(identity)
  }
  return current
}
