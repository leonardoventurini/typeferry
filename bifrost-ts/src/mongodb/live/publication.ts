import type { Document } from 'mongodb'

import type {
  MongoLiveClientDocument,
  MongoLiveProjectedFields,
  MongoLivePublicationConfig,
  MongoLivePublicationDefinition,
  MongoLivePublicationDescriptor,
} from './types'

/** Binds a client descriptor to its validated server-owned MongoDB query. */
export function defineMongoLivePublication<
  const TName extends string,
  TArgs,
  TScope,
  TStoredDocument extends Document,
  TFields extends object,
>(
  descriptor: MongoLivePublicationDescriptor<
    TName,
    TArgs,
    MongoLiveClientDocument<TFields>
  >,
  config: MongoLivePublicationConfig<
    TArgs,
    TScope,
    TStoredDocument,
    TFields
  >,
): MongoLivePublicationDefinition<typeof descriptor> {
  return {
    descriptor,
    name: descriptor.name,
    collection:
      config.collection as unknown as MongoLivePublicationDefinition<
        typeof descriptor
      >['collection'],
    protected: config.protected ?? true,
    parseArgs(value: unknown): TArgs {
      return config.args.parse(value)
    },
    async authorize(context, args): Promise<TScope> {
      return config.authorize(context, args as TArgs)
    },
    filter(scope, args) {
      return config.filter(scope as TScope, args as TArgs)
    },
    async project(
      document,
      scope,
    ): Promise<MongoLiveProjectedFields<TFields>> {
      const projected = await config.project(
        document as TStoredDocument,
        scope as TScope,
      )
      if ('_id' in projected) {
        throw new Error(
          `MongoDB live publication "${descriptor.name}" must not project "_id".`,
        )
      }
      return projected
    },
  }
}
