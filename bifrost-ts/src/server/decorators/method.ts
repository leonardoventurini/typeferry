/**
 * @Method decorator — marks a class method as a Bifrost RPC endpoint.
 *
 * Queues a metadata update that @Namespace flushes after all method decorators
 * have run. A pending queue keeps initializer ordering explicit across classes.
 *
 * @module bifrost/server/decorators/method
 */

import { getOrCreateMethodMeta, queueMethodUpdate } from './metadata'

/**
 * Marks a class method as a Bifrost RPC method.
 *
 * @param name - Optional override for the RPC method name (defaults to property key)
 */
export function Method(name?: string) {
  return function <T extends (...args: never[]) => unknown>(
    target: T,
    context: ClassMethodDecoratorContext,
  ): T {
    const key = String(context.name)

    queueMethodUpdate(Class => {
      const meta = getOrCreateMethodMeta(Class, key)
      meta.name = name ?? key
    })

    return target
  }
}
