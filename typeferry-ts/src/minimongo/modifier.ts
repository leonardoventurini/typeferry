import { MinimongoError } from './errors'
import { Matcher } from './matcher'
import { isNumericKey, isOperatorObject, isPlainObject, setPath } from './path'
import { Sorter } from './sorter'
import type { Modifier } from './types'
import { meteorValueSemantics, type ValueSemantics } from './value-semantics'

export interface ModifyOptions {
  readonly isInsert?: boolean
  readonly arrayIndices?: readonly (number | 'x')[]
  readonly now?: () => Date
}

function assertValidFieldNames(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertValidFieldNames)

    return
  }
  if (!isPlainObject(value)) return

  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$')) throw new MinimongoError(`Key ${key} must not start with '$'`)
    if (key.includes('\0')) throw new MinimongoError(`Key ${key} must not contain an embedded null byte`)
    if (key.includes('.')) throw new MinimongoError(`Key ${key} must not contain '.'`)
    assertValidFieldNames(child)
  }
}

interface Target {
  readonly parent: Record<string, unknown> | unknown[] | undefined
  readonly field: string
}

function modificationTarget(
  document: Record<string, unknown>,
  path: string,
  options: {
    readonly arrayIndices?: readonly (number | 'x')[]
    readonly noCreate?: boolean
    readonly forbidArray?: boolean
  },
): Target {
  const parts = path.split('.')
  const field = parts.pop()
  if (!field) throw new MinimongoError('Invalid empty update path', { field: path })
  const positional = [...(options.arrayIndices ?? [])].filter(value => value !== 'x')
  let current: Record<string, unknown> | unknown[] = document

  for (let index = 0; index < parts.length; index += 1) {
    let part = parts[index]!
    if (part === '$') {
      const position = positional.shift()
      if (position === undefined) {
        throw new MinimongoError('The positional operator did not find the match needed from the query', { field: path })
      }
      part = String(position)
    }
    if (options.forbidArray && Array.isArray(current)) {
      throw new MinimongoError('The source field cannot be an array element', { field: path })
    }
    const existing = Reflect.get(current, part) as unknown
    if (isPlainObject(existing) || Array.isArray(existing)) {
      current = existing
      continue
    }
    if (existing !== undefined && existing !== null) {
      throw new MinimongoError('Cannot set property on non-object field', {
        field: path,
        setPropertyError: true,
      })
    }
    if (options.noCreate) return { parent: undefined, field }

    const next = parts[index + 1]
    const child: Record<string, unknown> | unknown[] = next !== undefined && isNumericKey(next) ? [] : {}
    Reflect.set(current, part, child)
    current = child
  }

  if (field === '$') {
    const position = positional.shift()
    if (position === undefined) {
      throw new MinimongoError('The positional operator did not find the match needed from the query', { field: path })
    }

    return { parent: current, field: String(position) }
  }

  return { parent: current, field }
}

function readField(target: Target): unknown {
  return target.parent ? Reflect.get(target.parent, target.field) as unknown : undefined
}

function writeField(target: Target, value: unknown): void {
  if (target.parent) Reflect.set(target.parent, target.field, value)
}

function removeField(target: Target): void {
  if (!target.parent) return
  if (Array.isArray(target.parent) && isNumericKey(target.field)) {
    target.parent[Number(target.field)] = null
  } else {
    Reflect.deleteProperty(target.parent, target.field)
  }
}

function applyPush(
  target: Target,
  argument: unknown,
  values: ValueSemantics,
): void {
  let current = readField(target)
  if (current === undefined) {
    current = []
    writeField(target, current)
  }
  if (!Array.isArray(current)) throw new MinimongoError('Cannot apply $push modifier to non-array', { field: target.field })
  if (!isPlainObject(argument) || !Object.hasOwn(argument, '$each')) {
    assertValidFieldNames(argument)
    current.push(argument)

    return
  }

  const each = argument.$each
  if (!Array.isArray(each)) throw new MinimongoError('$each must be an array', { field: target.field })
  assertValidFieldNames(each)
  const position = argument.$position === undefined ? current.length : argument.$position
  if (typeof position !== 'number') throw new MinimongoError('$position must be a numeric value', { field: target.field })
  if (position < 0) throw new MinimongoError('$position in $push must be zero or positive', { field: target.field })
  current.splice(position, 0, ...each)

  if (argument.$sort !== undefined) {
    if (argument.$slice === undefined) throw new MinimongoError('$sort requires $slice to be present', { field: target.field })
    if (each.some(element => !isPlainObject(element))) {
      throw new MinimongoError('$push like modifiers using $sort require all elements to be objects', { field: target.field })
    }
    current.sort(new Sorter(argument.$sort, undefined, values).getComparator())
  }
  if (argument.$slice !== undefined) {
    if (typeof argument.$slice !== 'number') throw new MinimongoError('$slice must be a numeric value', { field: target.field })
    const sliced = argument.$slice === 0
      ? []
      : argument.$slice < 0
        ? current.slice(argument.$slice)
        : current.slice(0, argument.$slice)
    writeField(target, sliced)
  }
}

function pullMatches(value: unknown, argument: unknown, values: ValueSemantics): boolean {
  if (isPlainObject(argument)) {
    return new Matcher({ value: argument }, true, undefined, values)
      .documentMatches({ value }).result
  }

  return values.equals(value, argument, { keyOrderSensitive: true })
}

function applyModifierOperator(
  document: Record<string, unknown>,
  operator: string,
  path: string,
  argument: unknown,
  options: ModifyOptions,
  values: ValueSemantics,
): void {
  if (operator === '$setOnInsert' && !options.isInsert) return
  const actualOperator = operator === '$setOnInsert' ? '$set' : operator
  const noCreate = ['$unset', '$pop', '$pull', '$pullAll'].includes(actualOperator)
  const target = modificationTarget(document, path, {
    ...(options.arrayIndices ? { arrayIndices: options.arrayIndices } : {}),
    noCreate,
    forbidArray: actualOperator === '$rename',
  })
  const current = readField(target)

  if (actualOperator === '$set') {
    assertValidFieldNames(argument)
    writeField(target, argument)
  } else if (actualOperator === '$unset') {
    removeField(target)
  } else if (actualOperator === '$inc' || actualOperator === '$mul'
    || actualOperator === '$min' || actualOperator === '$max') {
    if (typeof argument !== 'number') throw new MinimongoError(`Modifier ${actualOperator} allowed for numbers only`, { field: path })
    if (current !== undefined && typeof current !== 'number') {
      throw new MinimongoError(`Cannot apply ${actualOperator} modifier to non-number`, { field: path })
    }
    if (actualOperator === '$inc') writeField(target, current === undefined ? argument : current + argument)
    if (actualOperator === '$mul') writeField(target, current === undefined ? 0 : current * argument)
    if (actualOperator === '$min' && (current === undefined || current > argument)) writeField(target, argument)
    if (actualOperator === '$max' && (current === undefined || current < argument)) writeField(target, argument)
  } else if (actualOperator === '$currentDate') {
    if (argument !== true && (!isPlainObject(argument) || argument.$type !== 'date')) {
      throw new MinimongoError('Invalid $currentDate modifier', { field: path })
    }
    writeField(target, options.now?.() ?? new Date())
  } else if (actualOperator === '$rename') {
    if (typeof argument !== 'string') throw new MinimongoError('$rename target must be a string', { field: path })
    if (path === argument) throw new MinimongoError('$rename source must differ from target', { field: path })
    if (argument.includes('\0')) throw new MinimongoError('The \'to\' field for $rename cannot contain an embedded null byte', { field: path })
    if (current !== undefined) {
      removeField(target)
      const destination = modificationTarget(document, argument, { forbidArray: true })
      writeField(destination, current)
    }
  } else if (actualOperator === '$push') {
    applyPush(target, argument, values)
  } else if (actualOperator === '$pushAll') {
    if (!Array.isArray(argument)) throw new MinimongoError('Modifier $pushAll/pullAll allowed for arrays only')
    if (current === undefined) writeField(target, argument)
    else if (!Array.isArray(current)) throw new MinimongoError('Cannot apply $pushAll modifier to non-array', { field: path })
    else current.push(...argument)
  } else if (actualOperator === '$addToSet') {
    const items = isPlainObject(argument) && Array.isArray(argument.$each) ? argument.$each : [argument]
    if (current === undefined) writeField(target, items)
    else if (!Array.isArray(current)) throw new MinimongoError('Cannot apply $addToSet modifier to non-array', { field: path })
    else for (const item of items) {
      if (!current.some(value => values.equals(value, item, { keyOrderSensitive: true }))) current.push(item)
    }
  } else if (actualOperator === '$pop') {
    if (current === undefined) return
    if (!Array.isArray(current)) throw new MinimongoError('Cannot apply $pop modifier to non-array', { field: path })
    if (typeof argument === 'number' && argument < 0) current.splice(0, 1)
    else current.pop()
  } else if (actualOperator === '$pull' || actualOperator === '$pullAll') {
    if (current === undefined) return
    if (!Array.isArray(current)) throw new MinimongoError('Cannot apply $pull/pullAll modifier to non-array', { field: path })
    const argumentsToPull = actualOperator === '$pullAll'
      ? Array.isArray(argument) ? argument : undefined
      : [argument]
    if (!argumentsToPull) throw new MinimongoError('Modifier $pushAll/pullAll allowed for arrays only')
    writeField(target, current.filter(value => !argumentsToPull.some(item => pullMatches(value, item, values))))
  } else if (actualOperator === '$bit') {
    throw new MinimongoError('$bit is not supported', { field: path })
  } else if (actualOperator !== '$v') {
    throw new MinimongoError(`Invalid modifier specified ${actualOperator}`)
  }
}

/** Mutates one stored document using Meteor-compatible replacement or operators. */
export function modifyDocument<TDocument extends Record<string, unknown>>(
  document: TDocument,
  modifier: Modifier<TDocument> | Partial<TDocument> | unknown,
  options: ModifyOptions = {},
  values: ValueSemantics = meteorValueSemantics,
): void {
  if (!isPlainObject(modifier)) throw new MinimongoError('Modifier must be an object')
  const cloned = values.clone(modifier)
  const keys = Object.keys(cloned)
  const operatorKeys = keys.filter(key => key.startsWith('$'))
  if (operatorKeys.length > 0 && operatorKeys.length !== keys.length) {
    throw new Error('Update parameter cannot have both modifier and non-modifier fields.')
  }

  if (operatorKeys.length === 0) {
    assertValidFieldNames(cloned)
    const id = document['_id']
    if (Object.hasOwn(cloned, '_id') && !values.equals(cloned._id, id)) {
      throw new MinimongoError('Cannot change the _id of a document')
    }
    for (const key of Object.keys(document)) delete document[key]
    Object.assign(document, cloned)
    if (id !== undefined) Reflect.set(document, '_id', id)

    return
  }

  for (const operator of operatorKeys) {
    const fields = cloned[operator]
    if (!isPlainObject(fields)) throw new MinimongoError(`Modifier ${operator}'s argument must be an object`)
    for (const [path, argument] of Object.entries(fields)) {
      if (path === '_id' || path.startsWith('_id.')) throw new MinimongoError('Mod on _id not allowed')
      applyModifierOperator(document, operator, path, argument, options, values)
    }
  }
}

/** Creates the base document used by a Meteor-style upsert. */
export function createUpsertDocument<TDocument extends Record<string, unknown>>(
  selector: unknown,
  modifier: Modifier<TDocument> | Partial<TDocument>,
  values: ValueSemantics = meteorValueSemantics,
): TDocument {
  const document: Record<string, unknown> = {}
  if (typeof selector === 'string' || typeof selector === 'number') document._id = selector
  else if (isPlainObject(selector)) {
    const populate = (value: Record<string, unknown>): void => {
      for (const [path, fieldValue] of Object.entries(value)) {
        if (path === '$and' && Array.isArray(fieldValue)) {
          for (const entry of fieldValue) if (isPlainObject(entry)) populate(entry)
        } else if (!path.startsWith('$')) {
          if (isPlainObject(fieldValue) && Object.hasOwn(fieldValue, '$eq')) setPath(document, path, values.clone(fieldValue.$eq))
          else if (!isOperatorObject(fieldValue)) setPath(document, path, values.clone(fieldValue))
        }
      }
    }
    populate(selector)
  }
  modifyDocument(document as TDocument, modifier, { isInsert: true }, values)

  return document as TDocument
}
