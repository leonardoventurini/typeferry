import { EJSON } from '.'

class Address {
  city: string
  state: string

  constructor(city: string, state: string) {
    this.city = city
    this.state = state
  }

  typeName() {
    return 'Address'
  }

  toJSONValue() {
    return {
      city: this.city,
      state: this.state,
    }
  }

  equals(other: unknown) {
    return (
      other instanceof Address &&
      this.city === other.city &&
      this.state === other.state
    )
  }
}

class Person {
  name: string
  birthDate: Date
  address: Address

  constructor(name: string, birthDate: Date, address: Address) {
    this.name = name
    this.birthDate = birthDate
    this.address = address
  }

  typeName() {
    return 'Person'
  }

  toJSONValue() {
    return {
      name: this.name,
      birthDate: EJSON.toJSONValue(this.birthDate),
      address: EJSON.toJSONValue(this.address),
    }
  }

  equals(other: unknown) {
    return (
      other instanceof Person &&
      this.name === other.name &&
      EJSON.equals(this.birthDate, other.birthDate) &&
      EJSON.equals(this.address, other.address)
    )
  }
}

class Holder {
  value: unknown

  constructor(value: unknown) {
    this.value = value
  }

  typeName() {
    return 'Holder'
  }

  toJSONValue() {
    return this.value
  }

  equals(other: unknown) {
    return other instanceof Holder && EJSON.equals(this.value, other.value)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError('Invalid custom EJSON value')
  }

  return value
}

const addTypes = (): void => {
  EJSON.addType(
    'Person',
    value => {
      const record = requireRecord(value)
      const birthDate = EJSON.fromJSONValue(record['birthDate'])
      const address = EJSON.fromJSONValue(record['address'])

      if (!(birthDate instanceof Date) || !(address instanceof Address)) {
        throw new TypeError('Invalid Person EJSON value')
      }

      return new Person(String(record['name']), birthDate, address)
    },
  )
  EJSON.addType('Address', value => {
    const record = requireRecord(value)

    return new Address(String(record['city']), String(record['state']))
  })
  EJSON.addType('Holder', value => new Holder(value))
}

export const CustomModels = {
  Address,
  Person,
  Holder,

  addTypes,
}
