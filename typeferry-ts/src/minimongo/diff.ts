import type { IdentityCodec } from './identity'
import type { MinimongoId } from './types'
import type { ValueSemantics } from './value-semantics'

export interface ChangeCallbacks<TDocument extends Record<string, unknown>> {
  readonly added?: (id: MinimongoId, fields: Partial<TDocument>) => void | Promise<void>
  readonly addedBefore?: (
    id: MinimongoId,
    fields: Partial<TDocument>,
    before: MinimongoId | null,
  ) => void | Promise<void>
  readonly changed?: (id: MinimongoId, fields: Partial<TDocument>) => void | Promise<void>
  readonly removed?: (id: MinimongoId) => void | Promise<void>
  readonly movedBefore?: (id: MinimongoId, before: MinimongoId | null) => void | Promise<void>
}
export function changedFields<TDocument extends Record<string, unknown>>(
  current: TDocument,
  previous: TDocument,
  values: ValueSemantics,
): Partial<TDocument> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(previous)) {
    if (key === '_id') continue
    if (!Object.hasOwn(current, key)) result[key] = undefined
    else if (!values.equals(current[key], previous[key])) result[key] = values.clone(current[key])
  }
  for (const key of Object.keys(current)) {
    if (key !== '_id' && !Object.hasOwn(previous, key)) result[key] = values.clone(current[key])
  }

  return result as Partial<TDocument>
}

function withoutId<TDocument extends Record<string, unknown>>(
  document: TDocument,
  values: ValueSemantics,
): Partial<TDocument> {
  const result = values.clone(document)

  delete result['_id']

  return result
}

export function diffUnordered<TDocument extends Record<string, unknown>>(
  previous: readonly TDocument[],
  current: readonly TDocument[],
  callbacks: ChangeCallbacks<TDocument>,
  codec: IdentityCodec<unknown>,
  values: ValueSemantics,
): void {
  const previousById = new Map(previous.map(document => [codec.stringify(document['_id']), document]))
  const currentKeys = new Set<string>()

  for (const document of current) {
    const id = document['_id'] as MinimongoId
    const key = codec.stringify(id)
    const oldDocument = previousById.get(key)
    currentKeys.add(key)
    if (!oldDocument) callbacks.added?.(id, withoutId(document, values))
    else {
      const fields = changedFields(document, oldDocument, values)
      if (Object.keys(fields).length > 0) callbacks.changed?.(id, fields)
    }
  }
  for (const document of previous) {
    const id = document['_id'] as MinimongoId
    if (!currentKeys.has(codec.stringify(id))) callbacks.removed?.(id)
  }
}

/** Meteor's ordered longest-common-subsequence diff and callback order. */
export function diffOrdered<TDocument extends Record<string, unknown>>(
  previous: readonly TDocument[],
  current: readonly TDocument[],
  callbacks: ChangeCallbacks<TDocument>,
  codec: IdentityCodec<unknown>,
  values: ValueSemantics,
): void {
  const oldIndex = new Map<string, number>()
  previous.forEach((document, index) => oldIndex.set(codec.stringify(document['_id']), index))
  const newKeys = new Set(current.map(document => codec.stringify(document['_id'])))
  const sequenceEnds: number[] = []
  const pointers: number[] = []
  let maximumLength = 0

  for (let newIndex = 0; newIndex < current.length; newIndex += 1) {
    const oldPosition = oldIndex.get(codec.stringify(current[newIndex]?.['_id']))
    if (oldPosition === undefined) continue
    let sequenceLength = maximumLength
    while (sequenceLength > 0) {
      const priorNewIndex = sequenceEnds[sequenceLength - 1]
      const priorOldPosition = priorNewIndex === undefined
        ? undefined
        : oldIndex.get(codec.stringify(current[priorNewIndex]?.['_id']))
      if (priorOldPosition !== undefined && priorOldPosition < oldPosition) break
      sequenceLength -= 1
    }
    pointers[newIndex] = sequenceLength === 0 ? -1 : sequenceEnds[sequenceLength - 1] ?? -1
    sequenceEnds[sequenceLength] = newIndex
    maximumLength = Math.max(maximumLength, sequenceLength + 1)
  }

  const unmoved: number[] = []
  let index = maximumLength === 0 ? -1 : sequenceEnds[maximumLength - 1] ?? -1
  while (index >= 0) {
    unmoved.push(index)
    index = pointers[index] ?? -1
  }
  unmoved.reverse()
  unmoved.push(current.length)

  for (const document of previous) {
    const id = document['_id'] as MinimongoId
    if (!newKeys.has(codec.stringify(id))) callbacks.removed?.(id)
  }

  let groupStart = 0
  for (const groupEnd of unmoved) {
    const anchor = current[groupEnd]?.['_id'] as MinimongoId | undefined
    const before = anchor ?? null
    for (let currentIndex = groupStart; currentIndex < groupEnd; currentIndex += 1) {
      const document = current[currentIndex]!
      const id = document['_id'] as MinimongoId
      const previousIndex = oldIndex.get(codec.stringify(id))
      if (previousIndex === undefined) {
        const fields = withoutId(document, values)
        callbacks.addedBefore?.(id, fields, before)
        callbacks.added?.(id, fields)
      } else {
        const fields = changedFields(document, previous[previousIndex]!, values)
        if (Object.keys(fields).length > 0) callbacks.changed?.(id, fields)
        callbacks.movedBefore?.(id, before)
      }
    }
    if (anchor !== undefined) {
      const document = current[groupEnd]!
      const previousIndex = oldIndex.get(codec.stringify(anchor))
      if (previousIndex !== undefined) {
        const fields = changedFields(document, previous[previousIndex]!, values)
        if (Object.keys(fields).length > 0) callbacks.changed?.(anchor, fields)
      }
    }
    groupStart = groupEnd + 1
  }
}
