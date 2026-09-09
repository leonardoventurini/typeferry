import { MinimongoError } from './errors'
import { isPlainObject } from './path'
import type { Projection } from './types'
import { meteorValueSemantics, type ValueSemantics } from './value-semantics'

export type ProjectionFunction<TDocument extends object> = (document: TDocument) => TDocument

type ProjectionRuleTree = { [field: string]: boolean | ProjectionRuleTree }

function projectionDetails(projection: Record<string, unknown>): {
  readonly including: boolean
  readonly tree: ProjectionRuleTree
} {
  let paths = Object.keys(projection).sort()
  if (!(paths.length === 1 && paths[0] === '_id')
    && !(paths.includes('_id') && projection['_id'])) {
    paths = paths.filter(path => path !== '_id')
  }
  const including = paths.length > 0 ? Boolean(projection[paths[0]!]) : false
  const tree: ProjectionRuleTree = {}

  for (const path of paths) {
    const rule = Boolean(projection[path])
    if (rule !== including) {
      throw new MinimongoError('You cannot currently mix including and excluding fields.')
    }
    const parts = path.split('.')
    let node = tree
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!
      const final = index === parts.length - 1
      const existing = node[part]
      if (existing !== undefined) {
        if (final || typeof existing === 'boolean') {
          const existingPath = parts.slice(0, index + 1).join('.')
          throw new MinimongoError(
            `both ${existingPath} and ${path} found in fields option, using both of them may trigger unexpected behavior. Did you mean to use only one of them?`,
          )
        }
        node = existing
        continue
      }
      if (final) {
        node[part] = including
      } else {
        const child: ProjectionRuleTree = {}
        node[part] = child
        node = child
      }
    }
  }

  return { including, tree }
}

function applyRuleTree(
  value: unknown,
  tree: ProjectionRuleTree,
  including: boolean,
  values: ValueSemantics,
): unknown {
  if (Array.isArray(value)) {
    return value.map(element => applyRuleTree(element, tree, including, values))
  }
  if (value === null || value === undefined) return value
  const result: Record<string, unknown> = including
    ? {}
    : isPlainObject(value)
      ? values.clone(value)
      : {}

  for (const [field, rule] of Object.entries(tree)) {
    if (!isPlainObject(value) || !Object.hasOwn(value, field)) continue
    if (typeof rule === 'object') {
      const child = value[field]
      if (typeof child === 'object' && child !== null) {
        result[field] = applyRuleTree(child, rule, including, values)
      }
    } else if (including) {
      result[field] = values.clone(value[field])
    } else {
      Reflect.deleteProperty(result, field)
    }
  }

  return result
}

/** Compiles inclusion or exclusion field projections with Meteor validation. */
export function compileProjection<TDocument extends object>(
  projection: Projection<TDocument> | Record<string, unknown> = {},
  values: ValueSemantics = meteorValueSemantics,
): ProjectionFunction<TDocument> {
  if (!isPlainObject(projection)) throw new MinimongoError('fields option must be an object')
  for (const [path, value] of Object.entries(projection)) {
    if (path.split('.').includes('$')) {
      throw new MinimongoError('Minimongo doesn\'t support $ operator in projections yet.')
    }
    if (isPlainObject(value) && ['$elemMatch', '$meta', '$slice'].some(key => Object.hasOwn(value, key))) {
      throw new MinimongoError('Minimongo doesn\'t support operators in projections yet.')
    }
    if (![0, 1, false, true].includes(value as 0 | 1 | false | true)) {
      throw new MinimongoError('Projection values should be one of 1, 0, true, or false')
    }
  }

  const idProjection = projection['_id'] === undefined || Boolean(projection['_id'])
  const details = projectionDetails(projection)

  return document => {
    const result = applyRuleTree(document, details.tree, details.including, values) as Record<string, unknown>
    if (idProjection && Object.hasOwn(document, '_id')) {
      result['_id'] = values.clone(Reflect.get(document, '_id'))
    } else if (!idProjection) {
      Reflect.deleteProperty(result, '_id')
    }

    return result as TDocument
  }
}
