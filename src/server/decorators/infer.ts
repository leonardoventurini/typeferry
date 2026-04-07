/**
 * Type-level utilities for extracting client-callable method types from
 * decorator-based Bifrost namespace classes.
 *
 * Bridges the gap between runtime decorator metadata and compile-time
 * type inference, enabling autocomplete on `client.m.ai.generation.abort(...)`.
 *
 * @module bifrost/server/decorators/infer
 */

import type { ClientNode } from '@example-app/bifrost/server/client-node'
import type { CallOptions } from '@example-app/bifrost/utils'

/**
 * Extracts `{ params: P; result: R }` from a Bifrost method signature.
 *
 * Uses tuple extraction on `Args` to distinguish 1-param from 2-param
 * methods, avoiding function bivariance where `(a) => R` would incorrectly
 * match `(a, b: infer P) => R`.
 */
type ExtractMethodSignature<T> = T extends (
  ...args: infer Args
) => Promise<infer R>
  ? Args extends [ClientNode, infer P]
    ? { params: P; result: R }
    : Args extends [ClientNode]
      ? { params: undefined; result: R }
      : never
  : never

/**
 * Maps class methods to client-callable signatures.
 * Filters out non-Bifrost methods (those without `ClientNode` first param).
 */
type MethodsOf<T> = {
  [K in keyof T as ExtractMethodSignature<T[K]> extends never
    ? never
    : K]: ExtractMethodSignature<T[K]> extends {
    params: infer P
    result: infer R
  }
    ? P extends undefined
      ? (options?: CallOptions) => Promise<R>
      : (params: P, options?: CallOptions) => Promise<R>
    : never
}

/**
 * Converts a dotted path string into a nested object type.
 *
 * @example
 * ```ts
 * PathToNested<'ai.generation', { abort: fn }>
 * // → { ai: { generation: { abort: fn } } }
 * ```
 */
type PathToNested<
  Path extends string,
  Value,
> = Path extends `${infer Head}.${infer Rest}`
  ? { [K in Head]: PathToNested<Rest, Value> }
  : { [K in Path]: Value }

/**
 * Infers a client-side type map from a decorated Bifrost namespace class.
 *
 * Extracts method signatures matching `(client: ClientNode, params: P) => Promise<R>`
 * and wraps them in a nested object keyed by the dotted prefix.
 *
 * @example
 * ```ts
 * // Server class:
 * \@Namespace('ai.generation')
 * class AiGenerationMethods {
 *   async abort(client: ClientNode, params: \{ generationId: string \}): Promise<void> \{ ... \}
 * }
 *
 * // Companion type (one line per class):
 * export type AiGenerationApi = InferNamespace<AiGenerationMethods, 'ai.generation'>
 * // → \{ ai: \{ generation: \{ abort: (params: \{ generationId: string \}, options?) => Promise<void> \} \} \}
 * ```
 *
 * Multiple namespaces compose via intersection:
 * ```ts
 * type AllAi = AiGenerationApi & AiMermaidApi & AiDeckApi
 * ```
 *
 * @typeParam T - Class instance type (the decorated class)
 * @typeParam Prefix - Dotted namespace prefix matching \@Namespace value
 */
export type InferNamespace<T, Prefix extends string> = Prefix extends ''
  ? MethodsOf<T>
  : PathToNested<Prefix, MethodsOf<T>>
