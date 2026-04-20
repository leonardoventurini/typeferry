/**
 * Bifrost decorator API — class/decorator-based alternative to the ns() builder.
 *
 * @module bifrost/server/decorators
 */

export { Cached, NoCache } from './cached'
export type { InferNamespace } from './infer'
export type { MethodMeta, NamespaceMeta } from './metadata'
export { Method } from './method'
export { Namespace } from './namespace'
export { Protected, Public } from './protected'
export { registerNamespace } from './register'
export { Schema } from './schema'
export { Use } from './use'
