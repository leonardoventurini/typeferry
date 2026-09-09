import type { ObjectID as ObjectIDContract } from './types'

const OBJECT_ID_LENGTH = 24
const OBJECT_ID_PATTERN = /^[0-9a-f]*$/

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)

  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}

/** Meteor-compatible client-side representation of a MongoDB ObjectID. */
export class ObjectID implements ObjectIDContract {
  private readonly hex: string

  constructor(hexString?: string) {
    const value = hexString ? hexString.toLowerCase() : randomHex(OBJECT_ID_LENGTH)

    if (value.length !== OBJECT_ID_LENGTH || !OBJECT_ID_PATTERN.test(value)) {
      throw new Error('Invalid hexadecimal string for creating an ObjectID')
    }

    this.hex = value
  }

  equals(other: unknown): boolean {
    return other instanceof ObjectID && this.valueOf() === other.valueOf()
  }

  clone(): ObjectID {
    return new ObjectID(this.hex)
  }

  typeName(): 'oid' {
    return 'oid'
  }

  getTimestamp(): number {
    return Number.parseInt(this.hex.slice(0, 8), 16)
  }

  valueOf(): string {
    return this.hex
  }

  toJSONValue(): string {
    return this.hex
  }

  toHexString(): string {
    return this.hex
  }

  toString(): string {
    return `ObjectID("${this.hex}")`
  }
}

export function looksLikeObjectID(value: string): boolean {
  return value.length === OBJECT_ID_LENGTH && OBJECT_ID_PATTERN.test(value)
}

