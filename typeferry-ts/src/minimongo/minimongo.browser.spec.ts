import { expect, test } from 'vitest'

import { LocalCollection } from './index'

test('runs the public Minimongo entrypoint in a browser', () => {
  const collection = new LocalCollection<{ label: string; score: number }>()
  const id = collection.insert({ label: 'browser', score: 2 })

  expect(id).toMatch(/^[0-9a-f]{24}$/)
  expect(collection.find({ score: { $gte: 2 } }).fetch()).toEqual([
    { _id: id, label: 'browser', score: 2 },
  ])
})
