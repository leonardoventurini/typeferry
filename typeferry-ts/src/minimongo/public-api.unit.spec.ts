import { describe, expect, it, vi } from 'vitest'

import { LocalCollection, Matcher, Minimongo, createMinimongo } from './index'
import { meteorValueSemantics } from './value-semantics'

describe('Minimongo public API', () => {
  it('provides the Meteor namespace facade', () => {
    expect(Minimongo).toEqual({
      LocalCollection,
      Matcher,
      Sorter: Minimongo.Sorter,
    })
  })

  it('binds replacement value semantics through dependent default ports', () => {
    const equals = vi.fn(meteorValueSemantics.equals)
    const runtime = createMinimongo({
      values: { ...meteorValueSemantics, equals },
      randomId: () => 'runtime-id',
    })
    const collection = new runtime.LocalCollection<{ value: number }, string>()

    expect(collection.insert({ value: 1 })).toBe('runtime-id')
    expect(collection.findOne({ value: 1 })?.value).toBe(1)
    expect(equals).toHaveBeenCalled()
  })

  it('allows the observer engine to be replaced independently', () => {
    const diff = vi.fn()
    const runtime = createMinimongo({
      observers: { diff },
    })
    const collection = new runtime.LocalCollection<{ value: number }, string>()
    collection.find().observeChanges({ added: () => undefined })

    collection.insert({ _id: 'one', value: 1 })

    expect(diff).toHaveBeenCalledOnce()
  })
})
