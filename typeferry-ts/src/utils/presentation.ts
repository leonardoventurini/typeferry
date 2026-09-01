import { v4 } from '@lukeed/uuid'

import { EJSON } from '../ejson'

export enum PayloadType {
  METHOD = 'method',
  RESULT = 'result',
  EVENT = 'event',
  ERROR = 'error',
  AUTH_RESULT = 'auth:result',
}

export namespace Presentation {
  export const uuid = v4

  export type Payload = {
    type: PayloadType
    [key: string]: any
  }

  export function decode<T = Payload>(payload: string | { data: string }): T {
    return EJSON.parse(
      typeof payload === 'string'
        ? payload
        : (payload as { data: string }).data,
    )
  }

  export function encode<T = Payload>(payload: T): string {
    return EJSON.stringify(payload)
  }
}
