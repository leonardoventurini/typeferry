/** Error raised when a local collection query cannot be compiled. */
export class LocalQueryError extends Error {
  override readonly name = 'LocalQueryError'
}

/** Error raised by a local collection mutation. */
export class LocalCollectionError extends Error {
  override readonly name = 'LocalCollectionError'
  readonly field: string | undefined
  readonly setPropertyError: boolean | undefined

  constructor(
    message: string,
    options: {
      readonly field?: string
      readonly setPropertyError?: boolean
    } = {},
  ) {
    super(options.field ? `${message} for field '${options.field}'` : message)
    this.field = options.field
    this.setPropertyError = options.setPropertyError
  }
}
