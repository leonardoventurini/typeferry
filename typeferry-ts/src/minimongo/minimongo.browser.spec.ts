import { expect, test } from 'vitest'

import { LocalCollection, ObjectID } from './index'

test('runs the public Minimongo entrypoint in a browser', () => {
  const collection = new LocalCollection<{ label: string; score: number }, string>()
  const id = collection.insert({ label: 'browser', score: 2 })

  expect(id).toHaveLength(17)
  expect(collection.find({ score: { $gte: 2 } }).fetch()).toEqual([
    { _id: id, label: 'browser', score: 2 },
  ])
  expect(new ObjectID().toHexString()).toHaveLength(24)
})
