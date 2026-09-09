/** Identifier values supported by the strict TypeFerry Minimongo API. */
export type MinimongoId = string | number | ObjectID

/** A schema after Minimongo has assigned its required identity. */
export type MaterializedDocument<
  TSchema extends object,
  TId extends MinimongoId = MinimongoId,
> = Omit<TSchema, '_id'> & { _id: TId }

/** Result of a transform after Minimongo restores the source identity. */
export type TransformedDocument<TDocument extends object, TOutput extends object> =
  TOutput & {
    _id: TDocument extends { _id: infer TId } ? TId : unknown
  }

/** Input accepted when inserting a document. */
export type InsertDocument<
  TSchema extends object,
  TId extends MinimongoId = MinimongoId,
> = Omit<TSchema, '_id'> & { _id?: TId }

type Primitive = string | number | boolean | bigint | symbol | null | undefined
type PreviousDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8]

/** Dot-separated paths through a document, bounded to protect the compiler. */
export type FieldPath<TValue, TDepth extends number = 8> = TDepth extends 0
  ? never
  : TValue extends Primitive | Date | RegExp | ObjectID
    ? never
    : TValue extends readonly (infer TElement)[]
      ? FieldPath<TElement, PreviousDepth[TDepth]>
      : {
          [TKey in Extract<keyof TValue, string>]:
            | TKey
            | (FieldPath<TValue[TKey], PreviousDepth[TDepth]> extends infer TRest
                ? TRest extends string
                  ? `${TKey}.${TRest}`
                  : never
                : never)
        }[Extract<keyof TValue, string>]

/** Resolves the value addressed by a dot-separated document path. */
export type ValueAtPath<TValue, TPath extends string> =
  TPath extends `${infer THead}.${infer TTail}`
    ? THead extends keyof TValue
      ? NonNullable<TValue[THead]> extends readonly (infer TElement)[]
        ? ValueAtPath<TElement, TTail>
        : ValueAtPath<NonNullable<TValue[THead]>, TTail>
      : unknown
    : TPath extends keyof TValue
      ? TValue[TPath]
      : unknown

export interface ObjectID {
  equals(other: unknown): boolean
  clone(): ObjectID
  typeName(): 'oid'
  toJSONValue(): string
  toHexString(): string
  getTimestamp(): number
  valueOf(): string
  toString(): string
}

export interface ComparisonSelector<TValue> {
  readonly $eq?: TValue
  readonly $ne?: TValue
  readonly $gt?: TValue
  readonly $gte?: TValue
  readonly $lt?: TValue
  readonly $lte?: TValue
  readonly $in?: readonly (TValue | RegExp)[]
  readonly $nin?: readonly (TValue | RegExp)[]
  readonly $exists?: boolean
  readonly $not?: SelectorValue<TValue>
}

export interface ArraySelector<TElement> extends ComparisonSelector<readonly TElement[]> {
  readonly $all?: readonly (TElement | RegExp)[]
  readonly $elemMatch?: SelectorValue<TElement> | Selector<TElement & object>
  readonly $size?: number
}

export interface StringSelector extends ComparisonSelector<string> {
  readonly $regex?: RegExp | string
  readonly $options?: string
}

export interface NumericSelector extends ComparisonSelector<number> {
  readonly $mod?: readonly [divisor: number, remainder: number]
  readonly $bitsAllClear?: number | readonly number[] | Uint8Array
  readonly $bitsAllSet?: number | readonly number[] | Uint8Array
  readonly $bitsAnyClear?: number | readonly number[] | Uint8Array
  readonly $bitsAnySet?: number | readonly number[] | Uint8Array
}

export type BsonTypeAlias =
  | 'double' | 'string' | 'object' | 'array' | 'binData' | 'undefined'
  | 'objectId' | 'bool' | 'date' | 'null' | 'regex' | 'dbPointer'
  | 'javascript' | 'symbol' | 'javascriptWithScope' | 'int' | 'timestamp'
  | 'long' | 'decimal' | 'minKey' | 'maxKey'

export type BsonTypeCode = -1 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 127

export interface TypeSelector {
  readonly $type?: BsonTypeAlias | BsonTypeCode
}

export type CoordinatePair = readonly [longitude: number, latitude: number]

export interface GeoJsonPoint {
  readonly type: 'Point'
  readonly coordinates: CoordinatePair
}

export interface NearSelector {
  readonly $near:
    | CoordinatePair
    | GeoJsonPoint
    | {
        readonly $geometry: GeoJsonPoint
        readonly $maxDistance?: number
      }
  readonly $maxDistance?: number
}

export type SelectorValue<TValue> =
  | TValue
  | (ComparisonSelector<TValue> & TypeSelector)
  | (TValue extends string ? StringSelector | RegExp : never)
  | (TValue extends number ? NumericSelector : never)
  | (TValue extends readonly (infer TElement)[] ? ArraySelector<TElement> : never)
  | TypeSelector
  | NearSelector

type FieldSelectorMap<TDocument extends object> = {
  readonly [TPath in FieldPath<TDocument>]?: SelectorValue<
    ValueAtPath<TDocument, TPath>
  >
}

export interface LogicalSelector<TDocument extends object> {
  readonly $and?: readonly Selector<TDocument>[]
  readonly $or?: readonly Selector<TDocument>[]
  readonly $nor?: readonly Selector<TDocument>[]
  readonly $where?: (this: TDocument, document: TDocument) => boolean
  readonly $comment?: string
}

/** A typed Meteor-compatible selector or literal predicate. */
export type Selector<TDocument extends object> =
  | MinimongoId
  | ((document: TDocument) => boolean)
  | (FieldSelectorMap<TDocument> & LogicalSelector<TDocument>)

export type Projection<TDocument extends object> = Readonly<
  Partial<Record<FieldPath<TDocument> | '_id', 0 | 1 | false | true>>
>

export type SortDirection = 1 | -1 | 'asc' | 'desc' | 'ascending' | 'descending'
export type SortSpecifier<TDocument extends object> =
  | Readonly<Partial<Record<FieldPath<TDocument>, SortDirection>>>
  | readonly (
      | FieldPath<TDocument>
      | readonly [FieldPath<TDocument>, SortDirection]
    )[]
  | ((left: TDocument, right: TDocument) => number)

export interface CollationOptions {
  readonly locale: string
  readonly strength?: 1 | 2 | 3 | 4 | 5
  readonly caseLevel?: boolean
  readonly numericOrdering?: boolean
  readonly caseFirst?: 'upper' | 'lower' | 'off'
  readonly alternate?: 'non-ignorable' | 'shifted'
  readonly maxVariable?: 'punct' | 'space'
  readonly backwards?: boolean
}

export interface FindOptions<TDocument extends object, TOutput extends object = TDocument> {
  readonly sort?: SortSpecifier<TDocument>
  readonly skip?: number
  readonly limit?: number
  readonly projection?: Projection<TDocument>
  readonly fields?: Projection<TDocument>
  readonly reactive?: boolean
  readonly transform?: ((document: TDocument) => TOutput) | null
  readonly collation?: CollationOptions
}

type NumericFieldMap<TDocument extends object> = {
  [TPath in FieldPath<TDocument>]?: ValueAtPath<TDocument, TPath> extends number
    ? number
    : never
}

type SetFieldMap<TDocument extends object> = {
  [TPath in FieldPath<TDocument>]?: ValueAtPath<TDocument, TPath>
}

type PushArgument<TElement> = TElement | {
  readonly $each: readonly TElement[]
  readonly $position?: number
  readonly $slice?: number
  readonly $sort?: TElement extends object ? SortSpecifier<TElement> : never
}

type PushFieldMap<TDocument extends object> = {
  [TPath in FieldPath<TDocument>]?: NonNullable<ValueAtPath<TDocument, TPath>> extends readonly (infer TElement)[]
    ? PushArgument<TElement>
    : never
}

type PushAllFieldMap<TDocument extends object> = {
  [TPath in FieldPath<TDocument>]?: NonNullable<ValueAtPath<TDocument, TPath>> extends readonly (infer TElement)[]
    ? readonly TElement[]
    : never
}

type AddToSetFieldMap<TDocument extends object> = {
  [TPath in FieldPath<TDocument>]?: NonNullable<ValueAtPath<TDocument, TPath>> extends readonly (infer TElement)[]
    ? TElement | { readonly $each: readonly TElement[] }
    : never
}

type PopFieldMap<TDocument extends object> = {
  [TPath in FieldPath<TDocument>]?: NonNullable<ValueAtPath<TDocument, TPath>> extends readonly unknown[]
    ? number
    : never
}

type PullFieldMap<TDocument extends object> = {
  [TPath in FieldPath<TDocument>]?: NonNullable<ValueAtPath<TDocument, TPath>> extends readonly (infer TElement)[]
    ? SelectorValue<TElement>
    : never
}

export interface Modifier<TDocument extends object> {
  readonly $currentDate?: Partial<Record<FieldPath<TDocument>, true | { readonly $type: 'date' }>>
  readonly $inc?: NumericFieldMap<TDocument>
  readonly $min?: NumericFieldMap<TDocument>
  readonly $max?: NumericFieldMap<TDocument>
  readonly $mul?: NumericFieldMap<TDocument>
  readonly $rename?: Partial<Record<FieldPath<TDocument>, FieldPath<TDocument>>>
  readonly $set?: SetFieldMap<TDocument>
  readonly $setOnInsert?: SetFieldMap<TDocument>
  readonly $unset?: Partial<Record<FieldPath<TDocument>, unknown>>
  readonly $push?: PushFieldMap<TDocument>
  readonly $pushAll?: PushAllFieldMap<TDocument>
  readonly $addToSet?: AddToSetFieldMap<TDocument>
  readonly $pop?: PopFieldMap<TDocument>
  readonly $pull?: PullFieldMap<TDocument>
  readonly $pullAll?: PushAllFieldMap<TDocument>
}

export interface UpdateOptions<TId extends MinimongoId = MinimongoId> {
  readonly multi?: boolean
  readonly upsert?: boolean
  readonly insertedId?: TId
  readonly _returnObject?: boolean
}

export interface UpsertResult<TId extends MinimongoId = MinimongoId> {
  readonly numberAffected: number
  readonly insertedId?: TId
}

export interface ObserveHandle {
  readonly collection: unknown
  readonly isReady: boolean
  readonly isReadyPromise: Promise<void>
  stop(): void
}

export interface ObserveCallbacks<TDocument> {
  readonly added?: (document: TDocument) => unknown
  readonly addedAt?: (document: TDocument, atIndex: number, before: MinimongoId | null) => unknown
  readonly changed?: (newDocument: TDocument, oldDocument: TDocument) => unknown
  readonly changedAt?: (newDocument: TDocument, oldDocument: TDocument, atIndex: number) => unknown
  readonly removed?: (oldDocument: TDocument) => unknown
  readonly removedAt?: (oldDocument: TDocument, atIndex: number) => unknown
  readonly movedTo?: (
    document: TDocument,
    fromIndex: number,
    toIndex: number,
    before: MinimongoId | null,
  ) => unknown
}

export interface ObserveChangesCallbacks<TDocument extends object> {
  readonly added?: (id: MinimongoId, fields: Partial<Omit<TDocument, '_id'>>) => unknown
  readonly addedBefore?: (
    id: MinimongoId,
    fields: Partial<Omit<TDocument, '_id'>>,
    before: MinimongoId | null,
  ) => unknown
  readonly changed?: (id: MinimongoId, fields: Partial<Omit<TDocument, '_id'>>) => unknown
  readonly removed?: (id: MinimongoId) => unknown
  readonly movedBefore?: (id: MinimongoId, before: MinimongoId | null) => unknown
}

/** Values used by a compiled matcher, including positional and geo metadata. */
export interface MatchResult {
  readonly result: boolean
  readonly distance?: number
  readonly arrayIndices?: readonly (number | 'x')[]
}
