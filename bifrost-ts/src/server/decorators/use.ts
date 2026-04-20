/**
 * @Use decorator — attaches middleware functions to a Bifrost method.
 *
 * Multiple @Use() decorators stack. TC39 decorators evaluate bottom-to-top,
 * so the pending queue receives entries in reverse order. @Namespace flushes
 * them with `.pop()`, restoring the visual order (top @Use runs first).
 *
 * @module bifrost/server/decorators/use
 */

import type { AnyFunction } from '../../utils'

import { getOrCreateMethodMeta, queueMethodUpdate } from './metadata'

/**
 * Attaches middleware functions to the decorated method.
 *
 * @example
 * ```ts
 * @Method()
 * @Schema(z.object({ boardId: z.string() }))
 * @Use(withBoardPermissionLevel(Permission.Read))
 * async get(client: ClientNode, { boardId, board }: GetBoardParams) { ... }
 * ```
 */
export function Use(...middleware: AnyFunction[]) {
  return function <T extends (...args: never[]) => unknown>(
    target: T,
    context: ClassMethodDecoratorContext,
  ): T {
    const key = String(context.name)

    queueMethodUpdate(Class => {
      const meta = getOrCreateMethodMeta(Class, key)
      meta.middleware.push(...middleware)
    })

    return target
  }
}
