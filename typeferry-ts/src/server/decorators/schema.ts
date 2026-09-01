/**
 * @Schema decorator — attaches a Zod validation schema to a TypeFerry method.
 *
 * @module typeferry/server/decorators/schema
 */

import type { z } from 'zod'

import { getOrCreateMethodMeta, queueMethodUpdate } from './metadata'

/**
 * Attaches a Zod schema for input validation on the decorated method.
 *
 * @example
 * ```ts
 * @Method()
 * @Schema(z.object({ boardId: z.string(), name: z.string().min(1) }))
 * async create(client: ClientNode, params: CreateParams) { ... }
 * ```
 */
export function Schema(schema: z.ZodType) {
  return function <T extends (...args: never[]) => unknown>(
    target: T,
    context: ClassMethodDecoratorContext,
  ): T {
    const key = String(context.name)

    queueMethodUpdate(Class => {
      const meta = getOrCreateMethodMeta(Class, key)
      meta.schema = schema
    })

    return target
  }
}
