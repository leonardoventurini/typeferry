/**
 * @Protected class decorator — sets `protected: true` as default for all methods.
 * @Public method decorator — overrides class-level @Protected for a specific method.
 *
 * @module typeferry/server/decorators/protected
 */

import {
  getOrCreateMethodMeta,
  getOrCreateNamespaceMeta,
  queueMethodUpdate,
} from './metadata'

/**
 * Sets `protected: true` as default for all methods in the class.
 * Individual methods can override with @Public().
 *
 * @example
 * ```ts
 * @Namespace('boards')
 * @Protected()
 * class BoardMethods {
 *   // All methods here require authentication by default
 * }
 * ```
 */
export function Protected() {
  return function <T>(
    target: T,
    context: ClassDecoratorContext | ClassMethodDecoratorContext,
  ): T {
    if (context.kind === 'class') {
      const meta = getOrCreateNamespaceMeta(target as object)
      meta.protected = true
      return target
    }

    const key = String(context.name)

    queueMethodUpdate(Class => {
      const meta = getOrCreateMethodMeta(Class, key)
      meta.protected = true
    })

    return target
  }
}

/**
 * Overrides class-level @Protected() for a specific method, making it public.
 *
 * @example
 * ```ts
 * @Namespace('boards')
 * @Protected()
 * class BoardMethods {
 *   @Method()
 *   @Public()
 *   async listPublic(client: ClientNode, params) { ... }
 *   // This method does NOT require authentication
 * }
 * ```
 */
export function Public() {
  return function <T extends (...args: never[]) => unknown>(
    target: T,
    context: ClassMethodDecoratorContext,
  ): T {
    const key = String(context.name)

    queueMethodUpdate(Class => {
      const meta = getOrCreateMethodMeta(Class, key)
      meta.protected = false
    })

    return target
  }
}
