import perf_hooks from 'perf_hooks'
import type { z } from 'zod'

import { isEmpty } from 'bifrost/utils/lodash'

import { EJSON } from '../ejson'
import type { AnyFunction, MethodParams as MethodParameters } from '../utils'
import {
  Errors,
  intercept,
  Presentation,
  SchemaValidationError,
  ServerEvents,
} from '../utils'
import { BifrostAsyncLocalStorage } from './bifrost-async-local-storage'
import type { ClientNode } from './client-node'
import type { Server } from './server'

/**
 * Function signature for Bifrost RPC methods.
 *
 * @typeParam T - The type of the method parameters
 * @typeParam R - The return type of the method
 */
export type MethodFunction<T = any, R = any> = (
  this: ClientNode,
  parameters?: MethodParameters<T>,
) => Promise<R> | R

/**
 * Configuration options for Bifrost RPC methods.
 *
 * @typeParam Schema - A Zod schema type for input validation
 *
 * @example
 * ```ts
 * Bifrost.addMethod(
 *   'user.create',
 *   async ({ email, name }) => { ... },
 *   {
 *     protected: true,
 *     schema: z.object({
 *       email: z.string().email(),
 *       name: z.string().min(1),
 *     }),
 *   }
 * )
 * ```
 */
export interface MethodOptions<Schema extends z.ZodType = z.ZodType> {
  /** Enable result caching for this method */
  cache?: boolean
  /** Cache TTL in milliseconds (default: 60000) */
  maxAge?: number
  /** Require authentication to call this method */
  protected?: boolean
  /** Middleware functions to run before the method handler */
  middleware?: AnyFunction[]
  /** Zod schema for input validation and type inference */
  schema?: Schema
}

interface MemoizeOptions {
  maxAge?: number
}

function customMemoize<T extends (...args: any[]) => any>(
  fn: T,
  options: MemoizeOptions = {},
): T {
  const cache = new Map<string, { value: any; timestamp: number }>()
  const { maxAge = 60000 } = options

  return function (this: any, ...args: Parameters<T>): ReturnType<T> {
    const key = EJSON.stringify(args[0]) // Normalize first argument (params)
    const now = Date.now()
    const cached = cache.get(key)

    if (cached && now - cached.timestamp < maxAge) {
      return cached.value
    }

    const result = fn.apply(this, args)
    cache.set(key, { value: result, timestamp: now })
    return result
  } as T
}

/**
 * Represents a registered Bifrost RPC method with validation and middleware support.
 *
 * Methods are the core RPC primitives in Bifrost. Each method can have:
 * - Input validation via Zod schemas
 * - Middleware chain for authentication/authorization
 * - Result caching with configurable TTL
 * - Execution time tracking
 *
 * @typeParam Schema - The Zod schema type for input validation
 * @typeParam Result - The return type of the method
 */
export class Method<Schema extends z.ZodType, Result> {
  uuid: string
  fn: MethodFunction
  isProtected: boolean
  middleware: AnyFunction[]
  schema: z.ZodSchema | null = null
  name: string
  server: Server

  constructor(
    server: Server,
    name: string,
    fn: MethodFunction<z.input<Schema> | any, Result>,
    opts: MethodOptions<Schema>,
  ) {
    const { cache, maxAge = 60000, schema } = opts ?? {}

    this.server = server
    this.name = name
    this.uuid = Presentation.uuid()
    this.isProtected = opts?.protected
    this.middleware = opts?.middleware
    this.fn = cache ? customMemoize(fn, { maxAge }) : fn

    this.schema = schema
  }

  /**
   * Executes the middleware chain, passing params through each middleware.
   * Each middleware can transform or augment the params before passing to the next.
   */
  async runMiddleware(
    parameters: MethodParameters,
    node?: ClientNode,
  ): Promise<MethodParameters> {
    if (isEmpty(this.middleware)) return parameters

    const wrapped = this.middleware.map(m => intercept(m))

    let buffer = parameters

    for (const step of wrapped) {
      buffer = await step.call(node, buffer)
    }

    return buffer
  }

  /**
   * Executes the method with validation, middleware, and timing.
   *
   * Execution flow:
   * 1. Validate params against Zod schema (if provided)
   * 2. Run middleware chain
   * 3. Execute method handler
   * 4. Emit execution event with timing data
   *
   * @throws {SchemaValidationError} When params fail Zod validation
   */
  async exec(parameters: MethodParameters, node?: ClientNode): Promise<Result> {
    const start = perf_hooks.performance.now()

    let cleanParameters = parameters

    if (this.schema) {
      // Normalize undefined/null params to empty object for schema validation.
      // This allows methods with all-optional fields to be called without params.
      const parametersToValidate = parameters ?? {}
      const result = this.schema.safeParse(parametersToValidate)
      if (!result.success) {
        const errorMessages = result.error.issues.map(
          issue => `${issue.path.join('.')}: ${issue.message}`,
        )
        console.error(
          `Schema validation failed for ${this.name}:`,
          errorMessages,
        )
        throw new SchemaValidationError(
          `${Errors.INVALID_PARAMS}: ${errorMessages.join(', ')}`,
          errorMessages,
        )
      }
      cleanParameters = result.data
    }

    const result = await BifrostAsyncLocalStorage.run(
      { executionId: Presentation.uuid(), context: node.context },
      async () => {
        const middlewareResult = await this.runMiddleware(cleanParameters, node)

        return this.fn.call(node, middlewareResult)
      },
    )

    const end = perf_hooks.performance.now()

    this.server.emit(ServerEvents.METHOD_EXECUTION, {
      method: this.name,
      time: end - start,
      params: cleanParameters,
      result,
    })

    return result
  }
}
