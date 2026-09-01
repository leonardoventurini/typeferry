import type { ReactiveControllerHost } from 'lit'

import type { ClientOptions } from '../client'
import { Client } from '../client'

import {
  type TypeFerryClientProvider,
  type TypeFerryClientSource,
  TypeFerryReactiveController,
  resolveClient,
} from './internal'

export type TypeFerryClientControllerOptions = {
  client?: TypeFerryClientSource
  clientOptions?: ClientOptions
}

export class TypeFerryClientController
  extends TypeFerryReactiveController
  implements TypeFerryClientProvider
{
  private readonly hasClientSource: boolean
  private readonly clientSource: TypeFerryClientSource
  private readonly clientOptions: ClientOptions | undefined
  private ownedClient: Client | null = null
  private currentClient: Client | null = null

  constructor(
    host: ReactiveControllerHost,
    options: TypeFerryClientControllerOptions = {},
  ) {
    super(host)

    this.hasClientSource = Object.prototype.hasOwnProperty.call(
      options,
      'client',
    )
    this.clientSource = options.client
    this.clientOptions = options.clientOptions

    this.attach()
  }

  get client(): Client | null {
    return this.currentClient
  }

  hostConnected(): void {
    this.syncClient()
  }

  hostUpdate(): void {
    this.syncClient()
  }

  hostDisconnected(): void {
    super.hostDisconnected()

    if (this.ownedClient && this.currentClient === this.ownedClient) {
      this.currentClient.close().catch(() => undefined)
    }

    this.currentClient = null
    this.ownedClient = null
  }

  private syncClient(): void {
    const nextClient = this.resolveCurrentClient()

    if (nextClient === this.currentClient) return

    this.currentClient = nextClient
    this.requestUpdate()
  }

  private resolveCurrentClient(): Client | null {
    if (this.hasClientSource) {
      return resolveClient(this.clientSource)
    }

    if (!this.ownedClient) {
      this.ownedClient = new Client(this.clientOptions ?? {})
    }

    return this.ownedClient
  }
}
