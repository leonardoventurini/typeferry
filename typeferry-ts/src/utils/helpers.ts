export namespace Helpers {
  export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
  export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

  export interface IRPCError {
    code: number
    message: string
    data?: string
  }

  export function isSecure(): boolean {
    return (
      typeof window === 'object' && document?.location?.protocol === 'https:'
    )
  }

  export function extend<
    TTarget extends object,
    TSource extends Record<string, (...args: never[]) => unknown>,
  >(target: TTarget, source: TSource): void {
    Object.entries(source).forEach(([key, fn]) => {
      Reflect.set(target, key, fn.bind(target))
    })
  }

  export function getCircularReplacer(): (
    key: string,
    value: unknown,
  ) => unknown {
    const seen = new WeakSet<object>()

    return (_key: string, value: unknown): unknown => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return
        }
        seen.add(value)
      }
      return value
    }
  }

  export function ensureArray<T>(value: T | T[]): T[] {
    return Array.isArray(value) ? value : [value]
  }

  export function toString(id: unknown): string {
    if (
      id != null &&
      typeof id === 'object' &&
      id.constructor.name === 'ObjectId' &&
      'toString' in id
    ) {
      return id.toString()
    }

    return String(id)
  }
}
