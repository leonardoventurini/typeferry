/**
 * @Namespace class decorator — registers a class as a TypeFerry RPC namespace.
 *
 * All methods in the class are prefixed with `{prefix}.{methodName}`.
 * Also flushes pending @Method metadata into the class's WeakMap entry.
 *
 * @module typeferry/server/decorators/namespace
 */

import { flushPendingUpdates, getOrCreateNamespaceMeta } from './metadata'

type ClassConstructor = abstract new (...args: unknown[]) => unknown

/**
 * Registers the decorated class as a TypeFerry namespace with the given prefix.
 *
 * Class decorators run after all method decorators, so we flush the pending
 * update queue here — each queued updater receives this class constructor
 * and writes its metadata into the class's WeakMap entry.
 *
 * @example
 * ```ts
 * @Namespace('boards')
 * class BoardMethods { ... }
 * // Methods register as: boards.get, boards.create, etc.
 * ```
 */
export function Namespace(prefix: string) {
  return function <T extends ClassConstructor>(
    target: T,
    _context: ClassDecoratorContext,
  ): T {
    const meta = getOrCreateNamespaceMeta(target)
    meta.prefix = prefix

    // Flush all pending method-level metadata updates (@Method, @Schema,
    // @Use, @Protected, @Cached, etc.) into this class's WeakMap entries.
    flushPendingUpdates(target)

    return target
  }
}
