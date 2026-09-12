export {
  LocalCollection,
  type CollectionInsertEvent,
  type CollectionRemoveEvent,
  type CollectionUpdateEvent,
} from './local-collection'
export {
  Cursor,
  type CollectionCursor,
  type CursorAddedEvent,
  type CursorChangedEvent,
  type CursorRemovedEvent,
} from './cursor'
export { LocalCollectionError, LocalQueryError } from './errors'
export { Matcher, isIdSelector } from './matcher'
export { Sorter } from './sorter'
export type { DeepReadonly } from './immutable'
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
  Projection,
  Selector,
  SelectorValue,
  SortDirection,
  SortSpecifier,
  StringSelector,
  TransformedDocument,
  UpdateOptions,
  UpsertOptions,
  UpsertResult,
  ValueAtPath,
} from './types'
