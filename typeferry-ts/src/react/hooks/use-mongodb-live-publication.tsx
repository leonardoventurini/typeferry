import {
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'

import {
  createMongoLiveView,
} from '../../mongodb/live/client'
import type {
  MongoLiveArgsOf,
  MongoLiveClientDocument,
  MongoLiveDocumentOf,
  MongoLivePublicationDescriptor,
  MongoLiveViewSnapshot,
} from '../../mongodb/live/types'
import { EJSON } from '../../ejson'
import { useClient } from './use-client'

/** Options accepted by `useMongoLivePublication`. */
export interface UseMongoLivePublicationOptions<
  TDescriptor extends MongoLivePublicationDescriptor<
    string,
    unknown,
    MongoLiveClientDocument
  >,
> {
  /** Typed named publication descriptor. */
  readonly publication: TDescriptor
  /** Arguments inferred from the publication descriptor. */
  readonly args: MongoLiveArgsOf<TDescriptor>
}

/** Materializes a named MongoDB publication and rerenders for every valid delta. */
export function useMongoLivePublication<
  TDescriptor extends MongoLivePublicationDescriptor<
    string,
    unknown,
    MongoLiveClientDocument
  >,
>(
  options: UseMongoLivePublicationOptions<TDescriptor>,
): MongoLiveViewSnapshot<MongoLiveDocumentOf<TDescriptor>> & {
  /** Requests a complete authoritative replacement. */
  readonly resync: () => Promise<void>
} {
  const client = useClient()
  const argsKey = EJSON.stringify(options.args, { canonical: true })
  const view = useMemo(
    () =>
      createMongoLiveView({
        client,
        publication: options.publication,
        args: options.args,
      }),
    [client, options.publication, argsKey],
  )
  const snapshot = useSyncExternalStore(
    view.subscribe,
    view.getSnapshot,
    view.getSnapshot,
  )

  useEffect(() => {
    void view.start()
    return () => {
      void view.stop()
    }
  }, [view])

  return {
    ...snapshot,
    resync: () => view.resync(),
  }
}
