/** Query compilation error used by Meteor's selector engine. */
export class MiniMongoQueryError extends Error {
  override readonly name = 'MiniMongoQueryError'
}

/** Mutation and collection error used by Meteor Minimongo. */
export class MinimongoError extends Error {
  override readonly name = 'MinimongoError'
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
