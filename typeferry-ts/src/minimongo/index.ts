export { LocalCollection, type LocalCollectionOptions } from './local-collection'
export { Cursor, type CollectionCursor, type CursorCollection } from './cursor'
export { Matcher, isIdSelector } from './matcher'
export { Sorter } from './sorter'
export { ObjectID, looksLikeObjectID } from './object-id'
export { wrapTransform } from './transform'
export { MiniMongoQueryError, MinimongoError } from './errors'
export { MemoryDocumentStore, type DocumentStore, type DocumentStoreFactory } from './document-store'
export { meteorIdentityCodec, type IdentityCodec } from './identity'
export { meteorValueSemantics, type ValueSemantics } from './value-semantics'
export {
  meteor352Components,
  minimongoComponents,
  SynchronousObserverScheduler,
  type MinimongoComponents,
  type MutationEngine,
  type ObserverEngine,
  type ObserverScheduler,
  type QueryEngine,
} from './components'
export { createMinimongo, type MinimongoRuntime } from './runtime'
export type {
  ArraySelector,
  CollationOptions,
  ComparisonSelector,
  FieldPath,
  FindOptions,
  InsertDocument,
  LogicalSelector,
  MatchResult,
  MaterializedDocument,
  MinimongoId,
  Modifier,
  NumericSelector,
  ObjectID as ObjectIDContract,
  ObserveCallbacks,
  ObserveChangesCallbacks,
  ObserveHandle,
  Projection,
  Selector,
  SelectorValue,
  SortDirection,
  SortSpecifier,
  StringSelector,
  TransformedDocument,
  UpdateOptions,
  UpsertResult,
  ValueAtPath,
} from './types'

import { LocalCollection } from './local-collection'
import { Matcher } from './matcher'
import { Sorter } from './sorter'

/** Meteor-compatible namespace export bound to the default 3.5.2 profile. */
export const Minimongo = Object.freeze({ LocalCollection, Matcher, Sorter })
