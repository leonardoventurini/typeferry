import type { IdentityCodec } from './identity'
import type { MinimongoId } from './types'
import type { ValueSemantics } from './value-semantics'

export interface ChangeCallbacks<TDocument extends object> {
  readonly added?: (id: MinimongoId, fields: Partial<Omit<TDocument, '_id'>>) => void | Promise<void>
  readonly addedBefore?: (
    id: MinimongoId,
    fields: Partial<Omit<TDocument, '_id'>>,
    before: MinimongoId | null,
  ) => void | Promise<void>
  readonly changed?: (id: MinimongoId, fields: Partial<Omit<TDocument, '_id'>>) => void | Promise<void>
  readonly removed?: (id: MinimongoId) => void | Promise<void>
  readonly movedBefore?: (id: MinimongoId, before: MinimongoId | null) => void | Promise<void>
}
export function changedFields<TDocument extends object>(
  current: TDocument,
  previous: TDocument,
  values: ValueSemantics,
): Partial<Omit<TDocument, '_id'>> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(previous)) {
    if (key === '_id') continue
    if (!Object.hasOwn(current, key)) result[key] = undefined
    else if (!values.equals(Reflect.get(current, key), Reflect.get(previous, key))) {
      result[key] = values.clone(Reflect.get(current, key))
    }
  }
  for (const key of Object.keys(current)) {
    if (key !== '_id' && !Object.hasOwn(previous, key)) {
      result[key] = values.clone(Reflect.get(current, key))
    }
  }

  return result as Partial<Omit<TDocument, '_id'>>
}

function withoutId<TDocument extends object>(
  document: TDocument,
  values: ValueSemantics,
): Partial<Omit<TDocument, '_id'>> {
  const result = values.clone(document)

  Reflect.deleteProperty(result, '_id')

  return result as Partial<Omit<TDocument, '_id'>>
}

export function diffUnordered<TDocument extends object>(
  previous: readonly TDocument[],
  current: readonly TDocument[],
  callbacks: ChangeCallbacks<TDocument>,
  codec: IdentityCodec<unknown>,
  values: ValueSemantics,
): void {
  const previousById = new Map(previous.map(document => [codec.stringify(Reflect.get(document, '_id')), document]))
  const currentKeys = new Set<string>()

  for (const document of current) {
    const id = Reflect.get(document, '_id') as MinimongoId
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
    const id = Reflect.get(document, '_id') as MinimongoId
    if (!currentKeys.has(codec.stringify(id))) callbacks.removed?.(id)
  }
}

/** Meteor's ordered longest-common-subsequence diff and callback order. */
export function diffOrdered<TDocument extends object>(
  previous: readonly TDocument[],
  current: readonly TDocument[],
  callbacks: ChangeCallbacks<TDocument>,
  codec: IdentityCodec<unknown>,
  values: ValueSemantics,
): void {
  const oldIndex = new Map<string, number>()
  previous.forEach((document, index) => oldIndex.set(codec.stringify(Reflect.get(document, '_id')), index))
  const newKeys = new Set(current.map(document => codec.stringify(Reflect.get(document, '_id'))))
  const sequenceEnds: number[] = []
  const pointers: number[] = []
  let maximumLength = 0

  for (let newIndex = 0; newIndex < current.length; newIndex += 1) {
    const oldPosition = oldIndex.get(codec.stringify(Reflect.get(current[newIndex]!, '_id')))
    if (oldPosition === undefined) continue
    let sequenceLength = maximumLength
    while (sequenceLength > 0) {
      const priorNewIndex = sequenceEnds[sequenceLength - 1]
      const priorOldPosition = priorNewIndex === undefined
        ? undefined
        : oldIndex.get(codec.stringify(Reflect.get(current[priorNewIndex]!, '_id')))
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
    const id = Reflect.get(document, '_id') as MinimongoId
    if (!newKeys.has(codec.stringify(id))) callbacks.removed?.(id)
  }

  let groupStart = 0
  for (const groupEnd of unmoved) {
    const anchorDocument = current[groupEnd]
    const anchor = anchorDocument === undefined
      ? undefined
      : Reflect.get(anchorDocument, '_id') as MinimongoId
    const before = anchor ?? null
    for (let currentIndex = groupStart; currentIndex < groupEnd; currentIndex += 1) {
      const document = current[currentIndex]!
      const id = Reflect.get(document, '_id') as MinimongoId
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
