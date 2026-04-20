/**
 * Registers a decorator-based namespace class with Bifrost.
 *
 * Reads WeakMap metadata from @Namespace, @Method, @Schema, @Use, @Protected,
 * @Cached decorators and calls `global.Bifrost.addMethod()` for each method.
 *
 * @module bifrost/server/decorators/register
 */

import type { ClientNode } from '../client-node'
import type { MethodFunction, MethodOptions } from '../method'

import type { MethodMeta, NamespaceMeta } from './metadata'
import { METHOD_META, NAMESPACE_META } from './metadata'

/** Build a full method name from namespace prefix and method name */
function buildFullName(nsMeta: NamespaceMeta, meta: MethodMeta): string {
  return nsMeta.prefix ? `${nsMeta.prefix}.${meta.name}` : meta.name
}

/** Merge class-level and method-level options into MethodOptions */
function buildOptions(nsMeta: NamespaceMeta, meta: MethodMeta): MethodOptions {
  const isProtected = meta.protected ?? nsMeta.protected
  const isCached = meta.cached ?? nsMeta.cached
  const maxAge = meta.maxAge ?? (isCached ? nsMeta.maxAge : undefined)

  return {
    protected: isProtected,
    middleware: meta.middleware.length > 0 ? meta.middleware : undefined,
    schema: meta.schema,
    cache: isCached || undefined,
    maxAge,
  }
}

/**
 * Wrap a decorator-style method (explicit client param) into Bifrost's
 * `this`-based ClientNode binding.
 */
function wrapMethod(
  boundFn: (client: ClientNode, params: unknown) => unknown,
): MethodFunction {
  return function (this: ClientNode, params) {
    return boundFn(this, params)
  }
}

/**
 * Registers all decorated methods on a namespace class with Bifrost.
 *
 * Creates a singleton instance, reads class/method metadata, wraps each method
 * to inject `ClientNode` as the first argument, and calls `global.Bifrost.addMethod()`.
 *
 * @param Class - A class decorated with @Namespace and containing @Method members
 *
 * @example
 * ```ts
 * import { registerNamespace } from '@example-app/bifrost/server/decorators'
 * import { BoardMethods } from './boards'
 *
 * registerNamespace(BoardMethods)
 * ```
 */
export function registerNamespace(
  Class: new (...args: never[]) => unknown,
): void {
  const nsMeta = NAMESPACE_META.get(Class)
  if (!nsMeta) {
    throw new Error(
      `Class "${Class.name}" is missing @Namespace decorator. ` +
        'Add @Namespace(prefix) to register it as a Bifrost namespace.',
    )
  }

  // Instantiate to get bound method references for Bifrost registration
  const instance = new (Class as new () => Record<string, unknown>)()

  const methodsMap = METHOD_META.get(Class)
  if (!methodsMap?.size) {
    throw new Error(
      `Namespace "${nsMeta.prefix}" (${Class.name}) has no @Method-decorated members.`,
    )
  }

  for (const [propertyKey, meta] of methodsMap) {
    const originalFn = instance[propertyKey] as (
      client: ClientNode,
      params: unknown,
    ) => unknown

    if (typeof originalFn !== 'function') {
      throw new Error(
        `"${propertyKey}" on ${Class.name} is not a function — cannot register as Bifrost method.`,
      )
    }

    global.Bifrost.addMethod(
      buildFullName(nsMeta, meta),
      wrapMethod(originalFn.bind(instance)),
      buildOptions(nsMeta, meta),
    )
  }
}
