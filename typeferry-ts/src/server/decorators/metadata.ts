/**
 * WeakMap-based metadata stores for TypeFerry decorator API.
 *
 * TC39 Stage 3 decorators don't have `reflect-metadata`, so we use WeakMaps
 * keyed by class constructor (namespace) and class prototype (methods).
 *
 * Method decorators push updates to a pending queue instead of using
 * `addInitializer` so metadata ownership stays explicit across classes defined
 * in the same file. The @Namespace decorator flushes the queue after methods.
 *
 * @module typeferry/server/decorators/metadata
 */

import type { z } from 'zod'

import type { AnyFunction } from '../../utils'

/** Class-level metadata set by @Namespace, @Protected, @Cached */
export interface NamespaceMeta {
  prefix: string
  protected: boolean
  cached: boolean
  maxAge: number
}

/** Per-method metadata set by @Method, @Schema, @Use, @Public, @Cached, @NoCache */
export interface MethodMeta {
  name: string
  schema?: z.ZodType
  middleware: AnyFunction[]
  /** undefined = inherit from class */
  protected?: boolean
  /** undefined = inherit from class */
  cached?: boolean
  maxAge?: number
}

/** Keyed by class constructor — stores namespace-level config */
export const NAMESPACE_META = new WeakMap<object, NamespaceMeta>()

/** Keyed by class constructor — maps method property keys to their config */
export const METHOD_META = new WeakMap<object, Map<string, MethodMeta>>()

/**
 * Pending method metadata updates, flushed by @Namespace.
 *
 * Each entry is a function that receives the class constructor and applies
 * its metadata. This avoids initializer ordering becoming shared state.
 */
export const PENDING_METHOD_UPDATES: Array<(Class: object) => void> = []

const DEFAULT_NAMESPACE_META: NamespaceMeta = {
  prefix: '',
  protected: false,
  cached: false,
  maxAge: 60_000,
}

/** Get or initialize namespace metadata for a class constructor */
export function getOrCreateNamespaceMeta(target: object): NamespaceMeta {
  let meta = NAMESPACE_META.get(target)
  if (!meta) {
    meta = { ...DEFAULT_NAMESPACE_META }
    NAMESPACE_META.set(target, meta)
  }
  return meta
}

/** Get or initialize the method metadata map for a class constructor */
export function getOrCreateMethodMap(target: object): Map<string, MethodMeta> {
  let map = METHOD_META.get(target)
  if (!map) {
    map = new Map()
    METHOD_META.set(target, map)
  }
  return map
}

/** Get or initialize metadata for a specific method on a class */
export function getOrCreateMethodMeta(target: object, key: string): MethodMeta {
  const map = getOrCreateMethodMap(target)
  let meta = map.get(key)
  if (!meta) {
    meta = { name: key, middleware: [] }
    map.set(key, meta)
  }
  return meta
}

/**
 * Queue a method-level metadata update to be flushed by @Namespace.
 *
 * @param updater - Receives the class constructor when flushed
 */
export function queueMethodUpdate(updater: (Class: object) => void): void {
  PENDING_METHOD_UPDATES.push(updater)
}

/**
 * Flush all pending method updates for the given class constructor.
 * Called by @Namespace after all method decorators have run.
 */
export function flushPendingUpdates(Class: object): void {
  while (PENDING_METHOD_UPDATES.length > 0) {
    const updater = PENDING_METHOD_UPDATES.pop()
    if (updater) updater(Class)
  }
}
