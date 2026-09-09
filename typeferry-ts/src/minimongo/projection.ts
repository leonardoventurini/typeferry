import { MiniMongoQueryError } from './errors'
import { deletePath, getPath, isPlainObject, setPath } from './path'
import type { Projection } from './types'
import { meteorValueSemantics, type ValueSemantics } from './value-semantics'

export type ProjectionFunction<TDocument extends object> = (document: TDocument) => TDocument

/** Compiles inclusion or exclusion field projections with Meteor validation. */
export function compileProjection<TDocument extends object>(
  projection: Projection<TDocument> | Record<string, unknown> = {},
  values: ValueSemantics = meteorValueSemantics,
): ProjectionFunction<TDocument> {
  if (!isPlainObject(projection)) throw new MiniMongoQueryError('fields option must be an object')

  const entries = Object.entries(projection)
  const nonIdEntries = entries.filter(([path]) => path !== '_id')
  const including = nonIdEntries.some(([, value]) => Boolean(value))
  if (nonIdEntries.some(([, value]) => Boolean(value) !== including)) {
    throw new MiniMongoQueryError('You cannot currently mix including and excluding fields.')
  }
  for (const [path, value] of entries) {
    if (path.split('.').includes('$')) throw new MiniMongoQueryError('Minimongo doesn\'t support $ operator in projections yet.')
    if (![0, 1, false, true].includes(value as 0 | 1 | false | true)) {
      throw new MiniMongoQueryError(`Projection values should be one of 1, 0, true, or false`)
    }
  }

  return document => {
    if (entries.length === 0) return values.clone(document)
    if (including) {
      const result: Record<string, unknown> = {}
      for (const [path, include] of nonIdEntries) {
        if (!include) continue
        const value = getPath(document, path)
        if (value !== undefined) setPath(result, path, values.clone(value))
      }
      const id = getPath(document, '_id')
      if (projection._id !== 0 && projection._id !== false && id !== undefined) result._id = values.clone(id)

      return result as TDocument
    }

    const result = values.clone(document) as Record<string, unknown>
    for (const [path, exclude] of entries) if (!exclude) deletePath(result, path)

    return result as TDocument
  }
}

