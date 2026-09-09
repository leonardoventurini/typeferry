import { isPlainObject } from './path'
import type { TransformedDocument } from './types'
import type { ValueSemantics } from './value-semantics'

const WRAPPED_TRANSFORM = Symbol('TypeFerryMinimongoWrappedTransform')

type WrappedTransform<TDocument extends object, TOutput extends object> =
  ((document: TDocument) => TransformedDocument<TDocument, TOutput>) & {
    readonly [WRAPPED_TRANSFORM]?: true
  }

/** Enforces Meteor's identity-preserving document transform contract. */
export function wrapTransform<TDocument extends object, TOutput extends object>(
  transform: ((document: TDocument) => TOutput) | null | undefined,
  values: ValueSemantics,
): ((document: TDocument) => TransformedDocument<TDocument, TOutput>) | undefined {
  if (!transform) return undefined
  const existing = transform as unknown as WrappedTransform<TDocument, TOutput>
  if (existing[WRAPPED_TRANSFORM]) return existing

  const wrapped: WrappedTransform<TDocument, TOutput> = document => {
    if (!Object.hasOwn(document, '_id')) throw new Error('can only transform documents with _id')
    const id = Reflect.get(document, '_id')
    const transformed: unknown = transform(document)
    if (!isPlainObject(transformed)) throw new Error('transform must return object')
    if (Object.hasOwn(transformed, '_id')) {
      if (!values.equals(transformed._id, id)) {
        throw new Error('transformed document can\'t have different _id')
      }
    } else {
      transformed._id = id
    }

    return transformed as TransformedDocument<TDocument, TOutput>
  }
  Object.defineProperty(wrapped, WRAPPED_TRANSFORM, { value: true })

  return wrapped as (document: TDocument) => TransformedDocument<TDocument, TOutput>
}
